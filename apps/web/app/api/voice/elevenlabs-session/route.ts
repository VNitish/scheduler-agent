import { NextRequest, NextResponse } from 'next/server';
import { db, users, userContext, userContacts, conversations, meetings, eq, and, sql } from '@repo/database';
import { SYSTEM_PROMPTS } from '@repo/ai-agent/src/prompts';

/**
 * Generate a signed URL for ElevenLabs Conversational AI
 * This allows the browser to connect directly to ElevenLabs without exposing the API key
 * Also returns user context for personalized conversations
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userToken = authHeader.replace('Bearer ', '');

    // Find user by access token
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.googleAccessToken, userToken))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    const elevenLabsAgentId = process.env.ELEVENLABS_AGENT_ID;

    if (!elevenLabsApiKey || !elevenLabsAgentId) {
      return NextResponse.json(
        { error: 'ElevenLabs not configured. Please set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID.' },
        { status: 500 }
      );
    }

    // Get a signed URL from ElevenLabs for the conversation
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${elevenLabsAgentId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': elevenLabsApiKey,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('ElevenLabs signed URL error:', errorData);
      return NextResponse.json(
        { error: 'Failed to get ElevenLabs session' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Fetch user context for personalization
    const [context] = await db
      .select()
      .from(userContext)
      .where(eq(userContext.userId, user.id))
      .limit(1);

    // Fetch user contacts for reference
    const contacts = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.userId, user.id))
      .limit(20);

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

    // Format recent meetings to ensure ALL date fields are strings
    const recentMeetings = recentMeetingsResult.map(meeting => ({
      ...meeting,
      startTime: typeof meeting.startTime === 'string' ? meeting.startTime : meeting.startTime.toISOString(),
      endTime: typeof meeting.endTime === 'string' ? meeting.endTime : meeting.endTime.toISOString(),
      createdAt: typeof meeting.createdAt === 'string' ? meeting.createdAt : meeting.createdAt.toISOString(),
      updatedAt: typeof meeting.updatedAt === 'string' ? meeting.updatedAt : meeting.updatedAt.toISOString(),
    }));

    // Create conversation record for this voice session
    const [conversation] = await db
      .insert(conversations)
      .values({
        userId: user.id,
        type: 'ELEVENLABS_VOICE',
        status: 'ACTIVE',
      })
      .returning();

    // Build system prompt with user context
    const systemPrompt = buildSystemPrompt(user, context, contacts, recentMeetings);

    return NextResponse.json({
      signed_url: data.signed_url,
      agent_id: elevenLabsAgentId,
      user_id: user.id,
      user_name: user.name || context?.displayName || 'there',
      system_prompt: systemPrompt,
      user_context: context || null,
      conversation_id: conversation.id,
    });
  } catch (error) {
    console.error('ElevenLabs session error:', error);
    return NextResponse.json(
      { error: 'Failed to create voice session' },
      { status: 500 }
    );
  }
}

function buildSystemPrompt(
  user: any,
  context: any,
  contacts: any[],
  recentMeetings: any[]
): string {
  // Use user's timezone for all date/time formatting
  const userTimezone = context?.timezone || 'UTC';

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: userTimezone,
  });

  const currentTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: userTimezone,
  });

  const userName = user.name || context?.displayName || 'the user';

  // Start with the base prompt template
  let prompt = SYSTEM_PROMPTS.ELEVENLABS_VOICE_AGENT
    .replace('{{DATE}}', today)
    .replace('{{TIME}}', currentTime)
    .replace('{{TIMEZONE}}', userTimezone)
    .replace('{{USER_NAME}}', userName)
    .replace('{{USER_CONTEXT}}', context ? formatUserContext(context, userName) : '')
    .replace('{{CONTACTS_LIST}}', contacts && contacts.length > 0 ? formatContactsList(contacts) : '')
    .replace('{{RECENT_MEETINGS}}', recentMeetings && recentMeetings.length > 0 ? formatRecentMeetings(recentMeetings, userTimezone) : '');

  return prompt;
}

function formatUserContext(context: any, userName: string): string {
  let userContext = '\n\nUSER CONTEXT:';

  if (context.timezone) {
    userContext += `\n- Timezone: ${context.timezone}`;
  }

  if (context.workingHoursStart && context.workingHoursEnd) {
    userContext += `\n- Working hours: ${context.workingHoursStart} to ${context.workingHoursEnd}`;
  }

  if (context.workingDays && context.workingDays.length > 0) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const workDays = context.workingDays.map((d: number) => dayNames[d]).join(', ');
    userContext += `\n- Working days: ${workDays}`;
  }

  if (context.mealTimings) {
    const meals = context.mealTimings;
    if (meals.lunch) {
      userContext += `\n- Lunch break: ${meals.lunch.start} to ${meals.lunch.end}`;
    }
  }

  if (context.summary) {
    userContext += `\n\nAbout ${userName}: ${context.summary}`;
  }

  return userContext;
}

function formatContactsList(contacts: any[]): string {
  let contactsList = '\n\nKNOWN CONTACTS (use these when scheduling with someone):';
  contacts.slice(0, 10).forEach(contact => {
    let contactInfo = `\n- ${contact.name}`;
    if (contact.email) contactInfo += ` (${contact.email})`;
    if (contact.nicknames && contact.nicknames.length > 0) {
      contactInfo += ` - also known as: ${contact.nicknames.join(', ')}`;
    }
    if (contact.relation) contactInfo += ` [${contact.relation}]`;
    contactsList += contactInfo;
  });

  return contactsList;
}

function formatRecentMeetings(recentMeetings: any[], userTimezone: string): string {
  let meetingsList = '\n\nRECENT MEETINGS (Last 7 Days):';
  recentMeetings.slice(0, 10).forEach(meeting => {
    // Ensure meeting.startTime is a valid date string before converting
    const startTimeStr = typeof meeting.startTime === 'string' ? meeting.startTime : meeting.startTime?.toISOString?.() || '';
    const startTime = new Date(startTimeStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: userTimezone,
    });
    meetingsList += `\n- ${meeting.title} (${startTime})`;
  });

  return meetingsList;
}
