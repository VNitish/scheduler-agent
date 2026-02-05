import { NextRequest, NextResponse } from 'next/server';
import { db, users, userContext, eq } from '@repo/database';
import { CalendarService } from '@repo/calendar';

/**
 * Helper to get the start of day in user's timezone
 */
function getStartOfDayInTimezone(date: Date, timezone: string): Date {
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: timezone });
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });
  const hourInTz = parseInt(formatter.format(utcMidnight), 10);
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

export async function GET(req: NextRequest) {
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

    if (!user.calendarConnected || !user.googleAccessToken) {
      return NextResponse.json({ error: 'Calendar not connected' }, { status: 400 });
    }

    // Get user's timezone
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

    // Initialize calendar service
    const calendarService = new CalendarService(
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

    // Get date range from query params or default to today + 7 days
    const url = new URL(req.url);
    const daysParam = url.searchParams.get('days');
    const days = daysParam ? parseInt(daysParam) : 7;

    const startDate = getStartOfDayInTimezone(new Date(), userTimezone);

    const endDateBase = new Date();
    endDateBase.setDate(endDateBase.getDate() + days);
    const endDate = getEndOfDayInTimezone(endDateBase, userTimezone);

    const events = await calendarService.getEvents(startDate, endDate);

    // Format events for frontend
    const formattedEvents = events.map(event => ({
      id: event.id,
      title: event.title,
      description: event.description,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      attendees: event.attendees || [],
    }));

    return NextResponse.json({
      events: formattedEvents,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
  } catch (error) {
    console.error('Calendar events error:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
