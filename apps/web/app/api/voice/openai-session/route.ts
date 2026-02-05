import { NextRequest, NextResponse } from 'next/server';
import { db, users, conversations, meetings, userContext, userContacts, eq, and, sql } from '@repo/database';

/**
 * Creates an ephemeral session token for OpenAI Realtime API
 * This token is used by the browser to connect directly to OpenAI
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

    // Create conversation record for this voice session
    const [conversation] = await db
      .insert(conversations)
      .values({
        userId: user.id,
        type: 'OPENAI_VOICE',
        status: 'ACTIVE',
      })
      .returning();

    // Fetch user context, contacts, and recent meetings for personalization
    const [context] = await db
      .select()
      .from(userContext)
      .where(eq(userContext.userId, user.id))
      .limit(1);

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

    // Build system prompt with user context
    const systemPrompt = buildSystemPrompt(user, context, contacts, recentMeetings);

    // Create ephemeral token from OpenAI
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'alloy', // Options: alloy, echo, fable, onyx, nova, shimmer
        instructions: systemPrompt,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI session error:', response.status, error);
      return NextResponse.json({
        error: 'Failed to create session',
        details: error
      }, { status: 500 });
    }

    const data = await response.json();

    // client_secret is an object with 'value' property
    const clientSecret = typeof data.client_secret === 'object'
      ? data.client_secret.value
      : data.client_secret;

    return NextResponse.json({
      client_secret: clientSecret,
      session_id: data.id,
      conversation_id: conversation.id,
    });
  } catch (error) {
    console.error('Session creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
  let prompt = `You are a friendly AI scheduling assistant. Today is ${today}. Current time is ${currentTime} (${userTimezone}).

## USER CONTEXT
${context ? formatUserContext(context, userName) : ''}

## USER CONTACTS
${contacts && contacts.length > 0 ? formatContactsList(contacts) : ''}

## RECENT MEETINGS (Last 7 Days)
${recentMeetings && recentMeetings.length > 0 ? formatRecentMeetings(recentMeetings, userTimezone) : ''}`;

  return prompt;
}

function formatUserContext(context: any, userName: string): string {
  let userContext = '';

  if (context.timezone) {
    userContext += `- Timezone: ${context.timezone}\n`;
  }

  if (context.workingHoursStart && context.workingHoursEnd) {
    userContext += `- Working hours: ${context.workingHoursStart} to ${context.workingHoursEnd}\n`;
  }

  if (context.workingDays && context.workingDays.length > 0) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const workDays = context.workingDays.map((d: number) => dayNames[d]).join(', ');
    userContext += `- Working days: ${workDays}\n`;
  }

  if (context.mealTimings) {
    const meals = context.mealTimings;
    if (meals.lunch) {
      userContext += `- Lunch break: ${meals.lunch.start} to ${meals.lunch.end}\n`;
    }
  }

  if (context.summary) {
    userContext += `About ${userName}: ${context.summary}\n`;
  }

  return userContext;
}

function formatContactsList(contacts: any[]): string {
  let contactsList = '';
  contacts.slice(0, 10).forEach(contact => {
    let contactInfo = `"${contact.name}"`;
    if (contact.email) contactInfo += ` - email: ${contact.email}`;
    if (contact.nicknames && contact.nicknames.length > 0) {
      contactInfo += ` (also called: ${contact.nicknames.join(', ')})`;
    }
    if (contact.relation) contactInfo += ` - ${contact.relation}`;
    contactsList += `- ${contactInfo}\n`;
  });

  return contactsList;
}

function formatRecentMeetings(recentMeetings: any[], userTimezone: string): string {
  let meetingsList = '';
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
    meetingsList += `- ${meeting.title} (${startTime})\n`;
  });

  return meetingsList;
}
