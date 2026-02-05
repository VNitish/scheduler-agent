import { NextRequest, NextResponse } from 'next/server';
import { db, users, conversations, messages, meetings, userContext, userContacts, eq, and, sql } from '@repo/database';
import { SchedulerAgent, UserContext, UserContact } from '@repo/ai-agent';
import { CalendarService } from '@repo/calendar';

// Helper function to recursively convert Date objects to ISO strings
function convertDatesToISO<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (obj instanceof Date) {
    return obj.toISOString() as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => convertDatesToISO(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = convertDatesToISO((obj as Record<string, unknown>)[key]);
      }
    }
    return result as T;
  }
  return obj;
}

export async function POST(req: NextRequest) {
  try {
    const { message, conversationId } = await req.json();
    const authHeader = req.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userToken = authHeader.replace('Bearer ', '');

    // Find user by access token
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.googleAccessToken, userToken))
      .limit(1);

    // If user not found, token might be expired - try to find by any token and refresh
    if (!user) {

      // Try to find ANY user with a refresh token (for development/single user scenarios)
      // In production, you'd need a better way to identify the user (like a session cookie)
      const [anyUser] = await db
        .select()
        .from(users)
        .limit(1);

      if (!anyUser || !anyUser.googleRefreshToken) {
        return NextResponse.json({ error: 'User not found or no refresh token' }, { status: 404 });
      }

      // Try to refresh the token
      try {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
            client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
            refresh_token: anyUser.googleRefreshToken,
            grant_type: 'refresh_token',
          }),
        });

        if (tokenResponse.ok) {
          const tokens = await tokenResponse.json();

          // Update the user with new token
          await db
            .update(users)
            .set({ googleAccessToken: tokens.access_token })
            .where(eq(users.id, anyUser.id));

          user = { ...anyUser, googleAccessToken: tokens.access_token };
        } else {
          return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
        }
      } catch (error) {
        console.error('[Chat] Token refresh error:', error);
        return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get or create conversation
    let conversation;
    if (conversationId) {
      [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);
    } else {
      [conversation] = await db
        .insert(conversations)
        .values({
          userId: user.id,
          type: 'TEXT',
          status: 'ACTIVE',
        })
        .returning();
    }

    // Save user message
    await db.insert(messages).values({
      conversationId: conversation.id,
      role: 'USER',
      content: message,
    });


    // Get conversation history (increased for better context)
    const history = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        role: messages.role,
        content: messages.content,
        toolCalls: messages.toolCalls,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(messages.createdAt)
      .limit(20);

    // Manually convert known date fields in history to ISO strings
    const convertedHistory = history.map(msg => ({
      ...msg,
      createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
    }));

    // Fetch user context and contacts for personalized scheduling
    const [contextData] = await db
      .select()
      .from(userContext)
      .where(eq(userContext.userId, user.id))
      .limit(1);

    const contactsData = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.userId, user.id));

    // Transform to agent-compatible types
    const agentContext: UserContext | undefined = contextData ? {
      displayName: contextData.displayName || undefined,
      location: contextData.location || undefined,
      timezone: contextData.timezone || undefined,
      gender: contextData.gender || undefined,
      summary: contextData.summary || undefined,
      workingHoursStart: contextData.workingHoursStart || undefined,
      workingHoursEnd: contextData.workingHoursEnd || undefined,
      workingDays: contextData.workingDays as number[] | undefined,
      mealTimings: contextData.mealTimings as UserContext['mealTimings'],
      otherBlockedTimes: contextData.otherBlockedTimes as UserContext['otherBlockedTimes'],
      preferInPerson: contextData.preferInPerson || undefined,
      officeLocation: contextData.officeLocation || undefined,
    } : undefined;

    const agentContacts: UserContact[] = contactsData.map(c => {
      // Create a clean object with only the fields defined in UserContact interface
      const cleanContact: UserContact = {
        id: c.id,
        name: c.name,
        email: c.email || undefined,
        nicknames: c.nicknames as string[] | undefined,
        relation: c.relation || undefined,
        company: c.company || undefined,
        timezone: c.timezone || undefined,
      };

      // Ensure no extra fields with Date objects are included
      return cleanContact;
    });

    // Force serialize all data to ensure no Date objects slip through
    const serializedContext = agentContext ? JSON.parse(JSON.stringify(agentContext)) : undefined;
    const serializedContacts = JSON.parse(JSON.stringify(agentContacts));

    // Initialize AI agent
    const agent = new SchedulerAgent(
      process.env.OPENAI_API_KEY!,
      'gpt-4o-mini'
    );

    // Initialize calendar service if connected
    let calendarService: CalendarService | undefined;
    if (user.calendarConnected && user.googleAccessToken) {
      calendarService = new CalendarService(
        user.googleAccessToken,
        user.googleRefreshToken || undefined,
        // Token refresh callback - update stored token
        async (tokens) => {
          if (tokens.access_token) {
            await db
              .update(users)
              .set({ googleAccessToken: tokens.access_token })
              .where(eq(users.id, user.id));
          }
        }
      );
    }

    // Get recent meetings (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    const recentMeetingsResult = await db
      .select()
      .from(meetings)
      .where(
        and(
          eq(meetings.userId, user.id),
          sql`${meetings.startTime} >= ${sevenDaysAgoISO}`
        )
      )
      .orderBy(meetings.startTime);

    // Debug: Check for Date objects in raw recent meetings

    // Format recent meetings to ensure ALL date fields are strings
    // Manually convert known date fields to ISO strings
    const convertedRecentMeetings = recentMeetingsResult.map(meeting => ({
      ...meeting,
      startTime: meeting.startTime instanceof Date ? meeting.startTime.toISOString() : meeting.startTime,
      endTime: meeting.endTime instanceof Date ? meeting.endTime.toISOString() : meeting.endTime,
      createdAt: meeting.createdAt instanceof Date ? meeting.createdAt.toISOString() : meeting.createdAt,
      updatedAt: meeting.updatedAt instanceof Date ? meeting.updatedAt.toISOString() : meeting.updatedAt,
    }));

    // Debug: Check for Date objects after manual conversion

    // Process message with all tools
    const startTime = Date.now();

    // Debug: Check for Date objects in all data before passing to agent

    const response = await agent.processMessage(
      user.id,
      message,
      convertedHistory.map((m) => ({
        role: m.role.toLowerCase() as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      {
        // Check availability with advanced options
        checkAvailability: async (args) => {
          if (!calendarService) {
            return { error: 'Calendar not connected. Please connect your Google Calendar first.' };
          }

          // Get user's timezone
          const userTimezone = serializedContext?.timezone || 'Asia/Kolkata';

          // Parse dates - they come as YYYY-MM-DD strings from the LLM
          // Create dates at start/end of day in user's timezone
          const startDate = new Date(args.startDate + 'T00:00:00');
          let endDate = new Date(args.endDate + 'T23:59:59');

          if (endDate <= startDate) {
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 7);
          }

          // Always use the advanced method which has proper timezone support
          const slots = await calendarService.findAvailableSlotsAdvanced(
            args.duration,
            startDate,
            endDate,
            {
              timePreference: args.timePreference,
              notBefore: args.notBefore,
              notAfter: args.notAfter,
              excludeDays: args.excludeDays,
              bufferBefore: args.bufferBefore,
              bufferAfter: args.bufferAfter,
              timezone: userTimezone,
            }
          );

          // Format times in user's timezone for LLM to display correctly
          const formatInTimezone = (date: Date) => {
            return date.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: userTimezone,
            });
          };

          // Add formatted times for display while keeping ISO for scheduling
          const formattedSlots = slots.map(slot => ({
            start: slot.start instanceof Date ? slot.start.toISOString() : slot.start,
            end: slot.end instanceof Date ? slot.end.toISOString() : slot.end,
            startFormatted: slot.start instanceof Date ? formatInTimezone(slot.start) : slot.start,
            endFormatted: slot.end instanceof Date ? formatInTimezone(slot.end) : slot.end,
            available: slot.available,
          }));

          return { slots: formattedSlots };
        },

        // Schedule a meeting
        scheduleMeeting: async (args) => {
          if (!calendarService) {
            return { error: 'Calendar not connected' };
          }

          try {
            const googleEventId = await calendarService.createMeeting({
              title: args.title,
              description: args.description,
              startTime: new Date(args.startTime),
              duration: args.duration,
              attendees: args.attendees,
            });

            const [meeting] = await db
              .insert(meetings)
              .values({
                userId: user.id,
                title: args.title,
                description: args.description,
                startTime: new Date(args.startTime),
                endTime: new Date(new Date(args.startTime).getTime() + args.duration * 60000),
                duration: args.duration,
                googleEventId,
                calendarSynced: true,
                attendees: args.attendees || [],
                conversationId: conversation.id,
                createdVia: 'CHAT',
              })
              .returning();

            await db
              .update(users)
              .set({ totalMeetings: (user.totalMeetings || 0) + 1 })
              .where(eq(users.id, user.id));

            // Convert any Date objects in meeting before returning
            const convertedMeeting = convertDatesToISO({ success: true, meetingId: meeting.id });

            // Debug: Check for Date objects in meeting before returning
            return convertedMeeting;
          } catch (error) {
            console.error('Error scheduling meeting:', error);
            return { error: 'Failed to schedule meeting' };
          }
        },

        // Find calendar event by search query
        findCalendarEvent: async (args) => {
          if (!calendarService) {
            return [];
          }

          const startDate = args.startDate ? new Date(args.startDate) : undefined;
          const endDate = args.endDate ? new Date(args.endDate) : undefined;
          const userTimezone = serializedContext?.timezone || 'Asia/Kolkata';

          const events = await calendarService.searchEvents(
            args.searchQuery,
            startDate,
            endDate
          );

          // Format times in user's timezone so LLM sees correct local times
          const formatInTimezone = (date: Date) => {
            return date.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: userTimezone,
            });
          };

          // Serialize events with timezone-formatted times for LLM readability
          // Also include ISO string for precise scheduling operations
          const serializedEvents = events.map(e => ({
            id: e.id,
            title: e.title,
            startTime: e.start instanceof Date ? e.start.toISOString() : e.start,
            endTime: e.end instanceof Date ? e.end.toISOString() : e.end,
            // Human-readable times in user's timezone for LLM to display
            startTimeFormatted: e.start instanceof Date ? formatInTimezone(e.start) : e.start,
            endTimeFormatted: e.end instanceof Date ? formatInTimezone(e.end) : e.end,
            attendees: e.attendees,
          }));

          return convertDatesToISO(serializedEvents);
        },

        // Get the last meeting of a specific day
        getLastMeetingOfDay: async (args) => {
          if (!calendarService) {
            return null;
          }

          const userTimezone = serializedContext?.timezone || 'Asia/Kolkata';
          const event = await calendarService.getLastMeetingOfDay(new Date(args.date), userTimezone);

          if (!event) return null;

          // Format times in user's timezone
          const formatInTimezone = (date: Date) => {
            return date.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: userTimezone,
            });
          };

          // Serialize with both ISO (for calculations) and formatted (for display)
          const serializedEvent = {
            id: event.id,
            title: event.title,
            startTime: event.start instanceof Date ? event.start.toISOString() : event.start,
            endTime: event.end instanceof Date ? event.end.toISOString() : event.end,
            startTimeFormatted: event.start instanceof Date ? formatInTimezone(event.start) : event.start,
            endTimeFormatted: event.end instanceof Date ? formatInTimezone(event.end) : event.end,
            attendees: event.attendees,
          };

          return convertDatesToISO(serializedEvent);
        },

        // Update an existing meeting
        updateMeeting: async (args) => {
          if (!calendarService) {
            return { success: false, error: 'Calendar not connected' };
          }

          try {
            await calendarService.updateMeeting(args.eventId, {
              title: args.title,
              description: args.description,
              startTime: args.startTime ? new Date(args.startTime) : undefined,
              duration: args.duration,
            });

            // Also update in our database if we have it
            if (args.title) {
              await db
                .update(meetings)
                .set({ title: args.title })
                .where(eq(meetings.googleEventId, args.eventId));
            }

            // Debug: Check for Date objects in result before returning
            return { success: true };
          } catch (error) {
            console.error('Error updating meeting:', error);
            return { success: false, error: 'Failed to update meeting' };
          }
        },

        // Get user context
        getUserContext: async (args) => {
          try {
            // Get user context
            const [contextData] = await db
              .select()
              .from(userContext)
              .where(eq(userContext.userId, user.id))
              .limit(1);

            // Get user contacts
            const contactsData = await db
              .select()
              .from(userContacts)
              .where(eq(userContacts.userId, user.id));

            // Get recent meetings (last 7 days)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const sevenDaysAgoISO = sevenDaysAgo.toISOString();

            const recentMeetingsResult = await db
              .select()
              .from(meetings)
              .where(
                and(
                  eq(meetings.userId, user.id),
                  sql`${meetings.startTime} >= ${sevenDaysAgoISO}`
                )
              )
              .orderBy(meetings.startTime);

            // Get user's timezone
            const userTimezone = contextData?.timezone || serializedContext?.timezone || 'Asia/Kolkata';

            // Format times in user's timezone
            const formatInTimezone = (date: Date | string) => {
              const d = typeof date === 'string' ? new Date(date) : date;
              return d.toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: userTimezone,
              });
            };

            // Format recent meetings with timezone-aware times for LLM
            const recentMeetings = recentMeetingsResult.map(m => ({
              ...JSON.parse(JSON.stringify(m)),
              startTimeFormatted: m.startTime ? formatInTimezone(m.startTime) : undefined,
              endTimeFormatted: m.endTime ? formatInTimezone(m.endTime) : undefined,
            }));

            // Debug: Check for Date objects in serialized recent meetings from this tool

            // Transform context to match UserContext interface
            const transformedContext: UserContext | null = contextData ? {
              displayName: contextData.displayName || undefined,
              location: contextData.location || undefined,
              timezone: contextData.timezone || undefined,
              gender: contextData.gender || undefined,
              summary: contextData.summary || undefined,
              workingHoursStart: contextData.workingHoursStart || undefined,
              workingHoursEnd: contextData.workingHoursEnd || undefined,
              workingDays: contextData.workingDays as number[] | undefined,
              mealTimings: contextData.mealTimings as UserContext['mealTimings'],
              otherBlockedTimes: contextData.otherBlockedTimes as UserContext['otherBlockedTimes'],
              preferInPerson: contextData.preferInPerson || undefined,
              officeLocation: contextData.officeLocation || undefined,
            } : null;

            // Transform contacts to match UserContact interface
            const transformedContacts: UserContact[] = contactsData.map(contact => ({
              id: contact.id,
              name: contact.name,
              email: contact.email || undefined,
              nicknames: contact.nicknames as string[] | undefined,
              relation: contact.relation || undefined,
              company: contact.company || undefined,
              timezone: contact.timezone || undefined,
            }));

            // Debug: Check for Date objects in raw context and contacts from this tool

            // Serialize to remove any Date objects
            const result = JSON.parse(JSON.stringify({
              context: transformedContext,
              contacts: transformedContacts,
              recentMeetings: recentMeetings,
            }));

            // Convert any remaining Date objects to ISO strings
            const convertedResult = convertDatesToISO(result);

            // Debug: Check for Date objects in final result from this tool
            return convertedResult;
          } catch (error) {
            console.error('Error getting user context:', error);
            return { context: null, contacts: [], recentMeetings: [], error: 'Failed to get user context' };
          }
        },

        // Update user context
        updateUserContext: async (args) => {
          try {
            // Check if context exists
            const [existingContext] = await db
              .select()
              .from(userContext)
              .where(eq(userContext.userId, user.id))
              .limit(1);

            if (!existingContext) {
              return { success: false, error: 'User context not found' };
            }

            // Update the context with provided fields
            const [updatedContext] = await db
              .update(userContext)
              .set({
                ...(args.summary !== undefined && { summary: args.summary }),
                ...(args.location !== undefined && { location: args.location }),
                ...(args.timezone !== undefined && { timezone: args.timezone }),
                ...(args.mealTimings !== undefined && { mealTimings: args.mealTimings }),
                ...(args.workingDays !== undefined && { workingDays: args.workingDays }),
                updatedAt: new Date(),
              })
              .where(eq(userContext.userId, user.id))
              .returning();

            // Debug: Check for Date objects in raw updated context

            // Serialize to remove Date objects
            const result = { success: true, context: JSON.parse(JSON.stringify(updatedContext)) };

            // Convert any remaining Date objects to ISO strings
            const convertedResult = convertDatesToISO(result);

            // Debug: Check for Date objects in final result
            return convertedResult;
          } catch (error) {
            console.error('Error updating user context:', error);
            return { success: false, error: 'Failed to update user context' };
          }
        },

        // Delete a meeting
        deleteMeeting: async (args) => {
          if (!calendarService) {
            return { success: false, error: 'Calendar not connected' };
          }

          try {
            await calendarService.deleteMeeting(args.eventId);

            // Also delete from our database if we have it
            await db
              .delete(meetings)
              .where(eq(meetings.googleEventId, args.eventId));

            // Debug: Check for Date objects in result before returning
            return { success: true };
          } catch (error) {
            console.error('Error deleting meeting:', error);
            return { success: false, error: 'Failed to delete meeting' };
          }
        },
      },
      serializedContext,
      serializedContacts,
      convertedRecentMeetings
    );

    // Save assistant message
    await db.insert(messages).values({
      conversationId: conversation.id,
      role: 'ASSISTANT',
      content: response.message,
      toolCalls: response.toolCalls || null,
    });

    // Debug: Check for Date objects in final response before sending to client
    const finalResponse = {
      message: response.message,
      conversationId: conversation.id,
      requiresInput: response.requiresInput,
    };

    // Convert any remaining Date objects to ISO strings in the final response
    const convertedFinalResponse = convertDatesToISO(finalResponse);


    // Final safeguard: ensure no Date objects remain by using JSON replacer
    const jsonString = JSON.stringify(convertedFinalResponse, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    });

    const parsedResponse = JSON.parse(jsonString);

    return NextResponse.json(parsedResponse);
  } catch (error) {
    console.error('Chat message error:', error);

    // Convert any Date objects in error response to ISO strings
    const errorResponse = convertDatesToISO({ error: 'Failed to process message' });

    // Final safeguard for error response too
    const errorJsonString = JSON.stringify(errorResponse, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    });

    const parsedErrorResponse = JSON.parse(errorJsonString);
    return NextResponse.json(parsedErrorResponse, { status: 500 });
  }
}
