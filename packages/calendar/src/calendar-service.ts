import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
}

export interface MeetingInput {
  title: string;
  description?: string;
  startTime: Date;
  duration: number; // minutes
  attendees?: string[];
  timeZone?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  attendees?: string[];
}

export class CalendarService {
  private oauth2Client: OAuth2Client;
  private calendar: any;
  private onTokenRefresh?: (tokens: { access_token?: string | null; refresh_token?: string | null }) => void;

  constructor(
    accessToken: string,
    refreshToken?: string,
    onTokenRefresh?: (tokens: { access_token?: string | null; refresh_token?: string | null }) => void
  ) {
    // Use NEXT_PUBLIC_GOOGLE_CLIENT_ID or GOOGLE_CLIENT_ID
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      process.env.GOOGLE_CLIENT_SECRET
    );

    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    // Handle token refresh
    this.onTokenRefresh = onTokenRefresh;
    this.oauth2Client.on('tokens', (tokens) => {
      if (this.onTokenRefresh) {
        this.onTokenRefresh(tokens);
      }
    });

    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Get calendar events in a date range
   */
  async getEvents(timeMin: Date, timeMax: Date): Promise<CalendarEvent[]> {
    try {
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      return (response.data.items || []).map((event: any) => ({
        id: event.id,
        title: event.summary,
        description: event.description,
        start: new Date(event.start.dateTime || event.start.date),
        end: new Date(event.end.dateTime || event.end.date),
        attendees: event.attendees?.map((a: any) => a.email) || [],
      }));
    } catch (error: any) {
      const errorDetails = error?.response?.data || error?.message || error;
      console.error('Error fetching calendar events:', errorDetails);
      if (error?.response?.status === 401 || error?.code === 401) {
        throw new Error('Calendar authentication expired. Please reconnect your Google account.');
      }
      throw new Error(`Failed to fetch calendar events: ${JSON.stringify(errorDetails)}`);
    }
  }

  /**
   * Search for calendar events by title/query
   */
  async searchEvents(query: string, startDate?: Date, endDate?: Date): Promise<CalendarEvent[]> {
    try {
      const timeMin = startDate || new Date();
      const timeMax = endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days ahead

      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        q: query, // Search query
      });

      return (response.data.items || []).map((event: any) => ({
        id: event.id,
        title: event.summary || '',
        description: event.description,
        start: new Date(event.start.dateTime || event.start.date),
        end: new Date(event.end.dateTime || event.end.date),
        attendees: event.attendees?.map((a: any) => a.email) || [],
      }));
    } catch (error) {
      console.error('Error searching calendar events:', error);
      return [];
    }
  }

  /**
   * Get the last meeting of a specific day
   */
  async getLastMeetingOfDay(date: Date, timezone: string = 'Asia/Kolkata'): Promise<CalendarEvent | null> {
    try {
      // Get start and end of day in user's timezone
      const startOfDay = this.setHourInTimezone(date, 0, timezone);
      const endOfDay = this.setHourInTimezone(date, 23, timezone);
      // Add 59 minutes, 59 seconds to end of day
      const endOfDayFull = new Date(endOfDay.getTime() + 59 * 60 * 1000 + 59 * 1000 + 999);

      const events = await this.getEvents(startOfDay, endOfDayFull);

      if (events.length === 0) return null;

      // Sort by end time and return the last one
      events.sort((a, b) => b.end.getTime() - a.end.getTime());
      return events[0];
    } catch (error) {
      console.error('Error getting last meeting of day:', error);
      return null;
    }
  }

  /**
   * Find available time slots with advanced constraints
   */
  async findAvailableSlotsAdvanced(
    duration: number,
    startDate: Date,
    endDate: Date,
    options?: {
      timePreference?: 'morning' | 'afternoon' | 'evening' | 'any';
      notBefore?: number; // hour (0-23) in user's timezone
      notAfter?: number; // hour (0-23) in user's timezone
      excludeDays?: number[]; // days of week to exclude (0=Sunday)
      bufferBefore?: number; // minutes
      bufferAfter?: number; // minutes
      timezone?: string; // user's timezone (e.g., 'Asia/Kolkata')
    }
  ): Promise<TimeSlot[]> {
    try {
      const freeBusyResponse = await this.calendar.freebusy.query({
        requestBody: {
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          items: [{ id: 'primary' }],
        },
      });

      const busyPeriods = freeBusyResponse.data.calendars?.primary?.busy || [];

      const freeSlots = this.calculateFreeSlotsAdvanced(
        busyPeriods.map((period: any) => ({
          start: new Date(period.start),
          end: new Date(period.end),
        })),
        startDate,
        endDate,
        duration,
        options
      );

      return freeSlots;
    } catch (error) {
      console.error('Error finding available slots:', error);
      throw new Error('Failed to find available slots');
    }
  }

  /**
   * Find available time slots
   */
  async findAvailableSlots(
    duration: number,
    startDate: Date,
    endDate: Date,
    timePreference?: 'morning' | 'afternoon' | 'evening' | 'any',
    timezone?: string
  ): Promise<TimeSlot[]> {
    // Use advanced method with timezone support
    return this.findAvailableSlotsAdvanced(duration, startDate, endDate, {
      timePreference,
      timezone: timezone || 'Asia/Kolkata',
    });
  }

  /**
   * Create a meeting
   */
  async createMeeting(meeting: MeetingInput): Promise<string> {
    try {
      const endTime = new Date(meeting.startTime.getTime() + meeting.duration * 60000);

      const event = await this.calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: meeting.title,
          description: meeting.description,
          start: {
            dateTime: meeting.startTime.toISOString(),
            timeZone: meeting.timeZone || 'Asia/Kolkata',
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: meeting.timeZone || 'Asia/Kolkata',
          },
          attendees: meeting.attendees?.map((email) => ({ email })),
          reminders: {
            useDefault: true,
          },
          conferenceData: {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        },
        conferenceDataVersion: 1,
        sendUpdates: 'all',
      });

      return event.data.id!;
    } catch (error) {
      console.error('Error creating meeting:', error);
      throw new Error('Failed to create meeting');
    }
  }

  /**
   * Update a meeting
   */
  async updateMeeting(eventId: string, updates: Partial<MeetingInput>): Promise<void> {
    try {
      const updateData: any = {};

      if (updates.title) updateData.summary = updates.title;
      if (updates.description) updateData.description = updates.description;
      if (updates.startTime && updates.duration) {
        const endTime = new Date(updates.startTime.getTime() + updates.duration * 60000);
        updateData.start = {
          dateTime: updates.startTime.toISOString(),
          timeZone: updates.timeZone || 'Asia/Kolkata',
        };
        updateData.end = {
          dateTime: endTime.toISOString(),
          timeZone: updates.timeZone || 'Asia/Kolkata',
        };
      }

      await this.calendar.events.patch({
        calendarId: 'primary',
        eventId,
        requestBody: updateData,
        sendUpdates: 'all',
      });
    } catch (error) {
      console.error('Error updating meeting:', error);
      throw new Error('Failed to update meeting');
    }
  }

  /**
   * Delete a meeting
   */
  async deleteMeeting(eventId: string): Promise<void> {
    try {
      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId,
        sendUpdates: 'all',
      });
    } catch (error) {
      console.error('Error deleting meeting:', error);
      throw new Error('Failed to delete meeting');
    }
  }

  /**
   * Calculate free time slots from busy periods
   */
  private calculateFreeSlots(
    busyPeriods: Array<{ start: Date; end: Date }>,
    startDate: Date,
    endDate: Date,
    duration: number,
    timePreference?: 'morning' | 'afternoon' | 'evening' | 'any'
  ): TimeSlot[] {
    const freeSlots: TimeSlot[] = [];
    const slotDuration = duration * 60 * 1000; // Convert to milliseconds
    const now = new Date();

    // Check if searching for a single day (user explicitly asked for "today" or a specific date)
    const isSingleDaySearch = startDate.toDateString() === endDate.toDateString() ||
      (endDate.getTime() - startDate.getTime() < 24 * 60 * 60 * 1000);

    // Sort busy periods
    busyPeriods.sort((a, b) => a.start.getTime() - b.start.getTime());

    let currentTime = new Date(startDate);

    // Apply time preference
    currentTime = this.applyTimePreference(currentTime, timePreference);

    // Skip to current time if we're looking at today and it's already past the start time
    const isToday = startDate.toDateString() === now.toDateString();
    if (isToday && now > currentTime) {
      // Round up to next 30-minute slot
      currentTime = new Date(now);
      const minutes = currentTime.getMinutes();
      if (minutes > 0 && minutes <= 30) {
        currentTime.setMinutes(30, 0, 0);
      } else if (minutes > 30) {
        currentTime.setHours(currentTime.getHours() + 1, 0, 0, 0);
      }
    }

    while (currentTime < endDate && freeSlots.length < 10) {
      const slotEnd = new Date(currentTime.getTime() + slotDuration);

      // Check if this slot is free
      const isSlotFree = !busyPeriods.some(
        (busy) =>
          (currentTime >= busy.start && currentTime < busy.end) ||
          (slotEnd > busy.start && slotEnd <= busy.end) ||
          (currentTime <= busy.start && slotEnd >= busy.end)
      );

      // Allow weekends for single-day searches (user explicitly asked for that day)
      if (isSlotFree && this.isWithinWorkingHours(currentTime, isSingleDaySearch)) {
        freeSlots.push({
          start: new Date(currentTime),
          end: slotEnd,
          available: true,
        });
      }

      // Move to next slot (30-minute increments)
      currentTime = new Date(currentTime.getTime() + 30 * 60 * 1000);

      // Skip to next day if past working hours (extended to 6 PM)
      if (currentTime.getHours() >= 18) {
        currentTime.setDate(currentTime.getDate() + 1);
        currentTime = this.applyTimePreference(currentTime, timePreference);
      }
    }

    // Return top 5 slots
    return freeSlots.slice(0, 5);
  }

  /**
   * Apply time preference to a date
   */
  private applyTimePreference(
    date: Date,
    preference?: 'morning' | 'afternoon' | 'evening' | 'any'
  ): Date {
    const newDate = new Date(date);

    switch (preference) {
      case 'morning':
        newDate.setHours(9, 0, 0, 0);
        break;
      case 'afternoon':
        newDate.setHours(13, 0, 0, 0);
        break;
      case 'evening':
        newDate.setHours(17, 0, 0, 0);
        break;
      default:
        newDate.setHours(9, 0, 0, 0);
    }

    return newDate;
  }

  /**
   * Check if time is within working hours (9 AM - 6 PM)
   * @param allowWeekends - If true, allows weekend days (for explicit single-day requests)
   */
  private isWithinWorkingHours(date: Date, allowWeekends: boolean = false): boolean {
    const hours = date.getHours();
    const day = date.getDay();

    // Check hours: 9 AM to 6 PM
    const withinHours = hours >= 9 && hours < 18;

    // Check day: Monday to Friday, or any day if weekends allowed
    const validDay = allowWeekends || (day >= 1 && day <= 5);

    return validDay && withinHours;
  }

  /**
   * Calculate free slots with advanced constraints
   */
  private calculateFreeSlotsAdvanced(
    busyPeriods: Array<{ start: Date; end: Date }>,
    startDate: Date,
    endDate: Date,
    duration: number,
    options?: {
      timePreference?: 'morning' | 'afternoon' | 'evening' | 'any';
      notBefore?: number;
      notAfter?: number;
      excludeDays?: number[];
      bufferBefore?: number;
      bufferAfter?: number;
      timezone?: string;
    }
  ): TimeSlot[] {
    const freeSlots: TimeSlot[] = [];
    const slotDuration = duration * 60 * 1000;
    const bufferBefore = (options?.bufferBefore || 0) * 60 * 1000;
    const bufferAfter = (options?.bufferAfter || 0) * 60 * 1000;
    const now = new Date();
    const timezone = options?.timezone || 'Asia/Kolkata';

    // Sort busy periods
    busyPeriods.sort((a, b) => a.start.getTime() - b.start.getTime());

    let currentTime = new Date(startDate);

    // Apply time preference or notBefore (in user's timezone)
    const startHour = options?.notBefore ?? this.getStartHourFromPreference(options?.timePreference);
    currentTime = this.setHourInTimezone(currentTime, startHour, timezone);

    // IMPORTANT: Skip to current time if we're looking at today and it's already past startHour
    const todayStr = this.getDateStringInTimezone(now, timezone);
    const startDateStr = this.getDateStringInTimezone(startDate, timezone);
    const isToday = todayStr === startDateStr;

    if (isToday && now > currentTime) {
      // Round up to next 30-minute slot
      currentTime = new Date(now);
      const minutes = currentTime.getMinutes();
      if (minutes > 0 && minutes <= 30) {
        currentTime.setMinutes(30, 0, 0);
      } else if (minutes > 30) {
        currentTime = new Date(currentTime.getTime() + (60 - minutes) * 60 * 1000);
        currentTime.setMinutes(0, 0, 0);
      }
    }

    const endHour = options?.notAfter ?? 18; // Default 6 PM

    // Check if searching for a single day (user explicitly asked for "today" or a specific date)
    const endDateStr = this.getDateStringInTimezone(endDate, timezone);
    const isSingleDaySearch = startDateStr === endDateStr ||
      (endDate.getTime() - startDate.getTime() < 24 * 60 * 60 * 1000);


    while (currentTime < endDate && freeSlots.length < 10) {
      // Get day and hour in user's timezone
      const dayOfWeek = this.getDayInTimezone(currentTime, timezone);
      const hour = this.getHourInTimezone(currentTime, timezone);

      // Helper to advance to next day at startHour
      const advanceToNextDay = () => {
        currentTime = new Date(currentTime.getTime() + 24 * 60 * 60 * 1000);
        currentTime = this.setHourInTimezone(currentTime, startHour, timezone);
      };

      // Skip excluded days
      if (options?.excludeDays?.includes(dayOfWeek)) {
        advanceToNextDay();
        continue;
      }

      // Skip weekends by default, UNLESS user explicitly asked for a specific day
      if (!isSingleDaySearch && (dayOfWeek === 0 || dayOfWeek === 6)) {
        advanceToNextDay();
        continue;
      }

      // Skip hours outside allowed range
      // Use > instead of >= to allow meetings to START at endHour (e.g., notAfter=10 allows 10:00)
      if (hour < startHour || hour > endHour) {
        if (hour > endHour) {
          advanceToNextDay();
        } else {
          currentTime = this.setHourInTimezone(currentTime, startHour, timezone);
        }
        continue;
      }

      // Check if slot end time would exceed allowed hours
      // Only enforce this for default working hours, not when user specifies exact time with notAfter
      const slotEnd = new Date(currentTime.getTime() + slotDuration + bufferAfter);
      const slotEndHour = this.getHourInTimezone(slotEnd, timezone);
      const userSpecifiedEndHour = options?.notAfter !== undefined;
      if (!userSpecifiedEndHour && (slotEndHour > endHour || (slotEndHour === endHour && slotEnd.getMinutes() > 0))) {
        advanceToNextDay();
        continue;
      }

      // Check if this slot (including buffers) is free
      const bufferedStart = new Date(currentTime.getTime() - bufferBefore);
      const bufferedEnd = new Date(currentTime.getTime() + slotDuration + bufferAfter);

      const isSlotFree = !busyPeriods.some(
        (busy) =>
          (bufferedStart >= busy.start && bufferedStart < busy.end) ||
          (bufferedEnd > busy.start && bufferedEnd <= busy.end) ||
          (bufferedStart <= busy.start && bufferedEnd >= busy.end)
      );

      if (isSlotFree) {
        freeSlots.push({
          start: new Date(currentTime),
          end: new Date(currentTime.getTime() + slotDuration),
          available: true,
        });
      }

      // Move to next slot (30-minute increments)
      currentTime = new Date(currentTime.getTime() + 30 * 60 * 1000);
    }

    return freeSlots.slice(0, 5);
  }

  /**
   * Get start hour from time preference
   */
  private getStartHourFromPreference(preference?: string): number {
    switch (preference) {
      case 'morning':
        return 9;
      case 'afternoon':
        return 13;
      case 'evening':
        return 17;
      default:
        return 9;
    }
  }

  /**
   * Get the hour of a date in a specific timezone
   */
  private getHourInTimezone(date: Date, timezone: string): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    });
    const hourStr = formatter.format(date);
    return parseInt(hourStr, 10);
  }

  /**
   * Get the day of week of a date in a specific timezone (0=Sunday, 6=Saturday)
   */
  private getDayInTimezone(date: Date, timezone: string): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: timezone,
    });
    const dayStr = formatter.format(date);
    const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return days[dayStr] ?? 0;
  }

  /**
   * Create a Date at a specific hour in a specific timezone
   * This helps avoid issues with setHours() using server local time
   */
  private setHourInTimezone(date: Date, hour: number, timezone: string): Date {
    // Get the current hour in the target timezone
    const currentHour = this.getHourInTimezone(date, timezone);
    // Calculate the difference and adjust
    const hourDiff = hour - currentHour;
    const result = new Date(date.getTime() + hourDiff * 60 * 60 * 1000);
    // Set minutes/seconds to 0
    const mins = result.getMinutes();
    const secs = result.getSeconds();
    const ms = result.getMilliseconds();
    return new Date(result.getTime() - mins * 60 * 1000 - secs * 1000 - ms);
  }

  /**
   * Get the date string (YYYY-MM-DD) in a specific timezone
   */
  private getDateStringInTimezone(date: Date, timezone: string): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    });
    return formatter.format(date);
  }
}
