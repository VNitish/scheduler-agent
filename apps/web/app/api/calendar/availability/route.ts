import { NextRequest, NextResponse } from 'next/server';
import { getUserWithCalendar } from '../../../../lib/calendar-helper';

export async function POST(req: NextRequest) {
  try {
    const { duration, startDate, endDate, timePreference } = await req.json();
    const authHeader = req.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userToken = authHeader.replace('Bearer ', '');

    // Get user and calendar service with automatic token refresh
    const { user, calendarService } = await getUserWithCalendar(userToken);

    if (!calendarService) {
      return NextResponse.json({ error: 'Calendar not connected' }, { status: 400 });
    }

    // Find available slots
    const slots = await calendarService.findAvailableSlots(
      duration,
      new Date(startDate),
      new Date(endDate),
      timePreference
    );

    return NextResponse.json({ slots });
  } catch (error) {
    console.error('Availability check error:', error);
    return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 });
  }
}
