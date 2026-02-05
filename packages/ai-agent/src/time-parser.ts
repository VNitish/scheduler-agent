import * as chrono from 'chrono-node';

export interface ParsedTimeRange {
  startDate: Date;
  endDate: Date;
  timePreference?: 'morning' | 'afternoon' | 'evening' | 'any';
}

export class TimeParser {
  /**
   * Parse natural language time expressions
   * Examples:
   * - "next Tuesday afternoon"
   * - "sometime late next week"
   * - "morning of June 20th"
   * - "before my 5 PM meeting on Friday"
   */
  static parseTimeExpression(text: string, referenceDate: Date = new Date()): ParsedTimeRange | null {
    // Parse with chrono-node
    const results = chrono.parse(text, referenceDate, { forwardDate: true });

    if (results.length === 0) {
      return null;
    }

    const result = results[0];
    let startDate = result.start.date();
    let endDate = result.end?.date() || new Date(startDate);

    // Detect time of day preferences
    const timePreference = this.detectTimePreference(text);

    // Adjust dates based on time preference
    if (timePreference === 'morning') {
      startDate = this.setTimeOfDay(startDate, 9, 0); // 9 AM
      endDate = this.setTimeOfDay(new Date(startDate), 12, 0); // 12 PM
    } else if (timePreference === 'afternoon') {
      startDate = this.setTimeOfDay(startDate, 13, 0); // 1 PM
      endDate = this.setTimeOfDay(new Date(startDate), 17, 0); // 5 PM
    } else if (timePreference === 'evening') {
      startDate = this.setTimeOfDay(startDate, 17, 0); // 5 PM
      endDate = this.setTimeOfDay(new Date(startDate), 21, 0); // 9 PM
    } else {
      // If no specific time, check entire day
      startDate = this.setTimeOfDay(startDate, 9, 0);
      endDate = this.setTimeOfDay(new Date(startDate), 17, 0);
    }

    // Handle "late next week" - extend to end of week
    if (text.includes('late') && text.includes('week')) {
      const endOfWeek = new Date(startDate);
      endOfWeek.setDate(endOfWeek.getDate() + (5 - endOfWeek.getDay())); // Friday
      endDate = endOfWeek;
    }

    // Handle "sometime next week" - entire week
    if (text.includes('sometime') && text.includes('week')) {
      const startOfWeek = new Date(startDate);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1); // Monday
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 4); // Friday
      startDate = startOfWeek;
      endDate = endOfWeek;
    }

    return {
      startDate,
      endDate,
      timePreference,
    };
  }

  /**
   * Detect time of day preference from text
   */
  private static detectTimePreference(
    text: string
  ): 'morning' | 'afternoon' | 'evening' | 'any' {
    const lowerText = text.toLowerCase();

    if (
      lowerText.includes('morning') ||
      lowerText.includes('a.m.') ||
      lowerText.includes('am')
    ) {
      return 'morning';
    }

    if (
      lowerText.includes('afternoon') ||
      lowerText.includes('lunch') ||
      lowerText.includes('midday')
    ) {
      return 'afternoon';
    }

    if (
      lowerText.includes('evening') ||
      lowerText.includes('night') ||
      lowerText.includes('p.m.') ||
      lowerText.includes('pm')
    ) {
      return 'evening';
    }

    return 'any';
  }

  /**
   * Set specific time of day on a date
   */
  private static setTimeOfDay(date: Date, hours: number, minutes: number): Date {
    const newDate = new Date(date);
    newDate.setHours(hours, minutes, 0, 0);
    return newDate;
  }

  /**
   * Parse duration from text
   * Examples: "30 minutes", "1 hour", "2 hours", "45 min"
   */
  static parseDuration(text: string): number | null {
    const lowerText = text.toLowerCase();

    // Match patterns like "30 minutes", "1 hour", "2.5 hours"
    const hourMatch = lowerText.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|h)s?/);
    if (hourMatch) {
      return Math.round(parseFloat(hourMatch[1]) * 60);
    }

    const minuteMatch = lowerText.match(/(\d+)\s*(?:minute|min|m)s?/);
    if (minuteMatch) {
      return parseInt(minuteMatch[1]);
    }

    return null;
  }
}
