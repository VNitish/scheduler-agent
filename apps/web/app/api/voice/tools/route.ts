import { NextRequest, NextResponse } from 'next/server';
import { db, users, meetings, userContacts, userContext, eq, and } from '@repo/database';
import { CalendarService } from '@repo/calendar';

/**
 * Helper to get the start of day in user's timezone
 */
function getStartOfDayInTimezone(date: Date, timezone: string): Date {
  // Get current date string in user's timezone
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD format
  // Create a date at midnight in that timezone by parsing the date string
  // and adjusting for the timezone offset
  const [year, month, day] = dateStr.split('-').map(Number);

  // Create date at midnight UTC then adjust
  const utcMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

  // Get the timezone offset at that time
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });

  // Find what hour it is in the target timezone when it's midnight UTC
  const hourInTz = parseInt(formatter.format(utcMidnight), 10);

  // Adjust to get midnight in the target timezone
  const offsetHours = hourInTz === 0 ? 0 : (hourInTz > 12 ? hourInTz - 24 : hourInTz);
  return new Date(utcMidnight.getTime() - offsetHours * 60 * 60 * 1000);
}

/**
 * Helper to get end of day in user's timezone
 */
function getEndOfDayInTimezone(date: Date, timezone: string): Date {
  const startOfDay = getStartOfDayInTimezone(date, timezone);
  return new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/**
 * Format time in user's timezone
 */
function formatTimeInTimezone(date: Date, timezone: string): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  });
}

/**
 * Format date in user's timezone
 */
function formatDateInTimezone(date: Date, timezone: string, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString('en-US', {
    ...options,
    timeZone: timezone,
  });
}

/**
 * Voice Tool Webhook
 * Called when the AI agent needs to execute a tool (check availability, schedule, update, delete meeting)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool_name, parameters, caller_id, conversationId, voiceType } = body;

    let user;

    // If caller_id is 'browser', authenticate via Authorization header
    if (caller_id === 'browser') {
      const authHeader = req.headers.get('authorization');
      if (!authHeader) {
        return NextResponse.json({
          result: "Authentication required. Please log in again.",
        });
      }

      const userToken = authHeader.replace('Bearer ', '');
      const [foundUser] = await db
        .select()
        .from(users)
        .where(eq(users.googleAccessToken, userToken))
        .limit(1);

      if (!foundUser) {
        return NextResponse.json({
          result: "User not found. Please log in again.",
        });
      }
      user = foundUser;
    } else if (caller_id) {
      // Phone call - find user by phone number (future feature)
      // For now, get the first user as fallback
      const [foundUser] = await db
        .select()
        .from(users)
        .limit(1);

      if (!foundUser) {
        return NextResponse.json({
          result: "No users found. Please sign up via the web app first.",
        });
      }
      user = foundUser;
    } else {
      return NextResponse.json({
        result: "Voice calling requires authentication. Please use the web app.",
      });
    }

    // Get user's timezone from context
    let userTimezone = 'UTC';
    try {
      const [context] = await db
        .select()
        .from(userContext)
        .where(eq(userContext.userId, user.id))
        .limit(1);
      if (context?.timezone) {
        userTimezone = context.timezone;
      }
    } catch (e) {
      // Using UTC as fallback timezone
    }

    // Initialize calendar service with token refresh callback
    let calendarService: CalendarService | undefined;
    if (user.calendarConnected && user.googleAccessToken) {
      calendarService = new CalendarService(
        user.googleAccessToken,
        user.googleRefreshToken || undefined,
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

    // Handle different tools
    switch (tool_name) {
      case 'check_availability': {
        if (!calendarService) {
          return NextResponse.json({
            result: "Your calendar isn't connected. Please connect it in the app first.",
          });
        }

        const { duration, date, time_preference } = parameters;

        // Parse date - handle natural language (timezone-aware)
        let baseDate = new Date();
        if (date) {
          const lowerDate = date.toLowerCase();
          if (lowerDate === 'today') {
            baseDate = new Date();
          } else if (lowerDate === 'tomorrow') {
            baseDate = new Date();
            baseDate.setDate(baseDate.getDate() + 1);
          } else {
            baseDate = new Date(date);
          }
        }
        const startDate = getStartOfDayInTimezone(baseDate, userTimezone);

        const endDateBase = new Date(baseDate);
        endDateBase.setDate(endDateBase.getDate() + 7);
        const endDate = getEndOfDayInTimezone(endDateBase, userTimezone);

        const slots = await calendarService.findAvailableSlots(
          duration || 30,
          startDate,
          endDate,
          time_preference,
          userTimezone
        );

        if (slots.length === 0) {
          return NextResponse.json({
            result: "I couldn't find any available slots for that time. Would you like to try a different day?",
          });
        }

        // Format slots for voice (using user's timezone)
        const slotDescriptions = slots.slice(0, 3).map((slot, i) => {
          const time = formatTimeInTimezone(slot.start, userTimezone);
          const day = formatDateInTimezone(slot.start, userTimezone, { weekday: 'long' });
          return `Option ${i + 1}: ${day} at ${time}`;
        });

        return NextResponse.json({
          result: `I found these available slots: ${slotDescriptions.join('. ')}. Which one works for you?`,
          slots: slots.slice(0, 3).map(s => ({
            start: s.start.toISOString(),
            end: s.end.toISOString(),
          })),
        });
      }

      case 'schedule_meeting': {
        if (!calendarService) {
          return NextResponse.json({
            result: "Your calendar isn't connected. Please connect it in the app first.",
          });
        }

        const { title, start_time, duration, attendees } = parameters;

        try {
          const startTime = new Date(start_time);

          // Create in Google Calendar
          const googleEventId = await calendarService.createMeeting({
            title: title || 'Meeting',
            startTime,
            duration: duration || 30,
            attendees: attendees || [],
          });

          // Save to database
          await db.insert(meetings).values({
            userId: user.id,
            title: title || 'Meeting',
            startTime,
            endTime: new Date(startTime.getTime() + (duration || 30) * 60000),
            duration: duration || 30,
            googleEventId,
            calendarSynced: true,
            attendees: attendees || [],
            conversationId: conversationId || null,
            createdVia: voiceType === 'ELEVENLABS_VOICE' ? 'ELEVENLABS_VOICE' : 'OPENAI_VOICE',
          });

          const timeStr = formatTimeInTimezone(startTime, userTimezone);
          const dateStr = formatDateInTimezone(startTime, userTimezone, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          });

          return NextResponse.json({
            result: `Done! I've scheduled "${title}" for ${dateStr} at ${timeStr}. You'll receive a calendar invitation. Is there anything else I can help you with?`,
            success: true,
            meeting_id: googleEventId,
          });
        } catch (error) {
          console.error('Error scheduling meeting:', error);
          return NextResponse.json({
            result: "I had trouble scheduling that meeting. Could you try again?",
            success: false,
          });
        }
      }

      case 'get_meetings': {
        if (!calendarService) {
          return NextResponse.json({
            result: "Your calendar isn't connected.",
          });
        }

        const { query, date } = parameters;

        // Parse date (timezone-aware)
        let baseStartDate = new Date();
        let baseEndDate = new Date();

        if (date) {
          const lowerDate = date.toLowerCase();
          if (lowerDate === 'today') {
            baseStartDate = new Date();
            baseEndDate = new Date();
          } else if (lowerDate === 'tomorrow') {
            baseStartDate = new Date();
            baseStartDate.setDate(baseStartDate.getDate() + 1);
            baseEndDate = new Date(baseStartDate);
          } else {
            baseStartDate = new Date(date);
            baseEndDate = new Date(date);
          }
        }

        const startDate = getStartOfDayInTimezone(baseStartDate, userTimezone);
        const endDate = getEndOfDayInTimezone(baseEndDate, userTimezone);

        let events;
        if (query) {
          events = await calendarService.searchEvents(query, startDate, endDate);
        } else {
          events = await calendarService.getEvents(startDate, endDate);
        }

        if (events.length === 0) {
          return NextResponse.json({
            result: query
              ? `I couldn't find any meetings matching "${query}".`
              : "You don't have any meetings scheduled for that day.",
            meetings: [],
          });
        }

        const meetingList = events.map(e => {
          const time = formatTimeInTimezone(e.start, userTimezone);
          return {
            id: e.id,
            title: e.title,
            time,
            description: `${e.title} at ${time}`,
          };
        });

        const meetingDescriptions = meetingList.map((m, i) => `${i + 1}. ${m.description}`).join('. ');

        return NextResponse.json({
          result: `Found ${events.length} meeting${events.length > 1 ? 's' : ''}: ${meetingDescriptions}`,
          meetings: meetingList,
        });
      }

      case 'update_meeting': {
        if (!calendarService) {
          return NextResponse.json({
            result: "Your calendar isn't connected.",
          });
        }

        const { meeting_id, title, start_time, duration } = parameters;

        if (!meeting_id) {
          return NextResponse.json({
            result: "I need the meeting ID to update it. Use get_meetings first to find the meeting.",
            success: false,
          });
        }

        try {
          const updates: any = {};
          if (title) updates.title = title;
          if (start_time) updates.startTime = new Date(start_time);
          if (duration) updates.duration = duration;

          await calendarService.updateMeeting(meeting_id, updates);

          // Also update in our database if it exists
          await db
            .update(meetings)
            .set({
              ...(title && { title }),
              ...(start_time && { startTime: new Date(start_time) }),
              ...(duration && { duration }),
              ...(start_time && duration && {
                endTime: new Date(new Date(start_time).getTime() + duration * 60000),
              }),
            })
            .where(eq(meetings.googleEventId, meeting_id));

          let updateDescription = 'Updated the meeting';
          if (title) updateDescription = `Renamed the meeting to "${title}"`;
          if (duration) updateDescription += ` and set duration to ${duration} minutes`;
          if (start_time) {
            const newTime = formatTimeInTimezone(new Date(start_time), userTimezone);
            updateDescription += ` at ${newTime}`;
          }

          return NextResponse.json({
            result: `${updateDescription}. Is there anything else?`,
            success: true,
          });
        } catch (error) {
          console.error('Error updating meeting:', error);
          return NextResponse.json({
            result: "I had trouble updating that meeting. Please make sure the meeting ID is correct.",
            success: false,
          });
        }
      }

      case 'delete_meeting': {
        if (!calendarService) {
          return NextResponse.json({
            result: "Your calendar isn't connected.",
          });
        }

        const { meeting_id } = parameters;

        if (!meeting_id) {
          return NextResponse.json({
            result: "I need the meeting ID to delete it. Use get_meetings first to find the meeting.",
            success: false,
          });
        }

        try {
          await calendarService.deleteMeeting(meeting_id);

          // Also delete from our database if it exists
          await db
            .delete(meetings)
            .where(eq(meetings.googleEventId, meeting_id));

          return NextResponse.json({
            result: "Done! I've deleted that meeting from your calendar. Is there anything else?",
            success: true,
          });
        } catch (error) {
          console.error('Error deleting meeting:', error);
          return NextResponse.json({
            result: "I had trouble deleting that meeting. Please make sure the meeting ID is correct.",
            success: false,
          });
        }
      }

      case 'get_todays_meetings': {
        if (!calendarService) {
          return NextResponse.json({
            result: "Your calendar isn't connected.",
          });
        }

        const today = getStartOfDayInTimezone(new Date(), userTimezone);
        const tomorrow = getEndOfDayInTimezone(new Date(), userTimezone);

        const events = await calendarService.getEvents(today, tomorrow);

        if (events.length === 0) {
          return NextResponse.json({
            result: "You don't have any meetings scheduled for today.",
          });
        }

        const meetingList = events.map(e => {
          const time = formatTimeInTimezone(e.start, userTimezone);
          return `${e.title} at ${time}`;
        }).join('. ');

        return NextResponse.json({
          result: `You have ${events.length} meeting${events.length > 1 ? 's' : ''} today: ${meetingList}`,
        });
      }

      case 'add_contact': {
        const { name, email, nickname, relation } = parameters;

        if (!name) {
          return NextResponse.json({
            result: "I need at least a name to add a contact.",
            success: false,
          });
        }

        try {
          const nicknames = nickname ? [nickname] : [];

          const [newContact] = await db.insert(userContacts).values({
            userId: user.id,
            name,
            email: email || null,
            nicknames: nicknames.length > 0 ? nicknames : [],
            relation: relation || null,
            company: null,
            timezone: 'UTC', // Default timezone
          }).returning();

          let response = `Added ${name} to your contacts`;
          if (email) response += ` with email ${email}`;
          if (nickname) response += ` (also known as ${nickname})`;
          response += '. Is there anything else?';

          return NextResponse.json({
            result: response,
            success: true,
            contact_id: newContact.id,
          });
        } catch (error) {
          console.error('Error adding contact:', error);
          return NextResponse.json({
            result: "I had trouble adding that contact. Please try again.",
            success: false,
          });
        }
      }

      case 'update_contact': {
        const { contact_id, name: contactName, search_name, email: contactEmail, nickname: contactNickname, relation: contactRelation } = parameters;

        try {
          let contactToUpdate;

          // Find contact by ID or by name search
          if (contact_id) {
            [contactToUpdate] = await db
              .select()
              .from(userContacts)
              .where(and(eq(userContacts.id, contact_id), eq(userContacts.userId, user.id)))
              .limit(1);
          } else if (search_name) {
            // Search by name or nickname
            const contacts = await db
              .select()
              .from(userContacts)
              .where(eq(userContacts.userId, user.id));

            contactToUpdate = contacts.find(c =>
              c.name.toLowerCase().includes(search_name.toLowerCase()) ||
              (c.nicknames && c.nicknames.some((n: string) => n.toLowerCase().includes(search_name.toLowerCase())))
            );
          }

          if (!contactToUpdate) {
            return NextResponse.json({
              result: "I couldn't find that contact. Try using get_contacts first to find the right one.",
              success: false,
            });
          }

          // Build updates
          const updates: any = {};
          if (contactName) updates.name = contactName;
          if (contactEmail) updates.email = contactEmail;
          if (contactRelation) updates.relation = contactRelation;

          // Handle nickname - add to existing nicknames
          if (contactNickname) {
            const existingNicknames = contactToUpdate.nicknames || [];
            if (!existingNicknames.includes(contactNickname)) {
              updates.nicknames = [...existingNicknames, contactNickname];
            }
          }

          updates.updatedAt = new Date();

          await db
            .update(userContacts)
            .set(updates)
            .where(eq(userContacts.id, contactToUpdate.id));

          let response = `Updated ${contactToUpdate.name}'s information`;
          if (contactName && contactName !== contactToUpdate.name) response = `Renamed ${contactToUpdate.name} to ${contactName}`;
          if (contactEmail) response += `, email set to ${contactEmail}`;
          if (contactNickname) response += `, added nickname "${contactNickname}"`;
          if (contactRelation) response += `, marked as ${contactRelation}`;
          response += '. Anything else?';

          return NextResponse.json({
            result: response,
            success: true,
          });
        } catch (error) {
          console.error('Error updating contact:', error);
          return NextResponse.json({
            result: "I had trouble updating that contact. Please try again.",
            success: false,
          });
        }
      }

      case 'get_contacts': {
        const { search } = parameters;

        try {
          let contacts;

          if (search) {
            // Search by name or nickname
            const allContacts = await db
              .select()
              .from(userContacts)
              .where(eq(userContacts.userId, user.id));

            contacts = allContacts.filter(c =>
              c.name.toLowerCase().includes(search.toLowerCase()) ||
              (c.nicknames && c.nicknames.some((n: string) => n.toLowerCase().includes(search.toLowerCase()))) ||
              (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
            );
          } else {
            contacts = await db
              .select()
              .from(userContacts)
              .where(eq(userContacts.userId, user.id))
              .limit(10);
          }

          if (contacts.length === 0) {
            return NextResponse.json({
              result: search
                ? `I couldn't find any contacts matching "${search}".`
                : "You don't have any contacts saved yet.",
              contacts: [],
            });
          }

          const contactList = contacts.map(c => {
            let info = c.name;
            if (c.email) info += ` (${c.email})`;
            if (c.nicknames && c.nicknames.length > 0) info += ` - also called: ${c.nicknames.join(', ')}`;
            if (c.relation) info += ` [${c.relation}]`;
            return { id: c.id, name: c.name, email: c.email, description: info };
          });

          const descriptions = contactList.map((c, i) => `${i + 1}. ${c.description}`).join('. ');

          return NextResponse.json({
            result: `Found ${contacts.length} contact${contacts.length > 1 ? 's' : ''}: ${descriptions}`,
            contacts: contactList,
          });
        } catch (error) {
          console.error('Error getting contacts:', error);
          return NextResponse.json({
            result: "I had trouble fetching your contacts. Please try again.",
            contacts: [],
          });
        }
      }

      default:
        return NextResponse.json({
          result: "I'm not sure how to help with that. I can check availability, schedule, update, or delete meetings, and manage your contacts.",
        });
    }
  } catch (error) {
    console.error('Voice tool error:', error);
    return NextResponse.json({
      result: "I encountered an error. Please try again.",
    });
  }
}
