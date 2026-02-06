/**
 * Represents a calendar event with all necessary details
 */
export interface CalendarEvent {
  /** Unique identifier for the event */
  id: string;
  /** Title or subject of the event */
  title: string;
  /** Start time in ISO string format */
  start: string;
  /** End time in ISO string format */
  end: string;
  /** List of attendee email addresses */
  attendees?: string[];
}

/**
 * Possible states for voice interactions
 */
export type VoiceState = 'idle' | 'connecting' | 'connected' | 'speaking' | 'listening';

/**
 * Represents a chat message with sender and content
 */
export interface ChatMessage {
  /** Role of the message sender ('user' or 'assistant') */
  role: 'user' | 'assistant';
  /** Content of the message */
  content: string;
}

/**
 * Represents a tool call made during conversation
 */
export interface ToolCall {
  /** Name of the tool being called */
  name: string;
  /** Arguments passed to the tool */
  arguments: Record<string, any>;
  /** Result of the tool execution */
  result?: any;
}

/**
 * References for managing voice session state
 */
export interface VoiceSessionRefs {
  /** Reference to the OpenAI realtime client */
  realtimeClientRef: React.MutableRefObject<any | null>;
  /** Reference to the ElevenLabs realtime client */
  elevenLabsClientRef: React.MutableRefObject<any | null>;
  /** Reference to pending tool calls */
  pendingToolCallsRef: React.MutableRefObject<ToolCall[]>;
  /** Reference to voice session start time */
  voiceStartTimeRef: React.MutableRefObject<number | null>;
}

/**
 * Gets the user's timezone from localStorage or falls back to browser timezone
 */
export const getUserTimezone = (): string => {
  if (typeof window !== 'undefined') {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.timezone) return user.timezone;
      }
    } catch (e) {
      // Ignore parsing errors
    }
    // Fallback to browser's timezone
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return 'UTC';
};

/**
 * Formats a date string to a localized time string in user's timezone
 * @param dateStr - Date string in ISO format
 * @returns Formatted time string (e.g., "2:30 PM")
 */
export const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const timezone = getUserTimezone();
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  });
};

/**
 * Checks if a given date string represents today in user's timezone
 * @param dateStr - Date string in ISO format
 * @returns True if the date is today, false otherwise
 */
export const isToday = (dateStr: string) => {
  const timezone = getUserTimezone();
  const date = new Date(dateStr);
  const today = new Date();

  // Format both dates in user's timezone to compare
  const dateInTz = date.toLocaleDateString('en-CA', { timeZone: timezone });
  const todayInTz = today.toLocaleDateString('en-CA', { timeZone: timezone });

  return dateInTz === todayInTz;
};

/**
 * Checks if a given date string represents tomorrow in user's timezone
 * @param dateStr - Date string in ISO format
 * @returns True if the date is tomorrow, false otherwise
 */
export const isTomorrow = (dateStr: string) => {
  const timezone = getUserTimezone();
  const date = new Date(dateStr);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Format both dates in user's timezone to compare
  const dateInTz = date.toLocaleDateString('en-CA', { timeZone: timezone });
  const tomorrowInTz = tomorrow.toLocaleDateString('en-CA', { timeZone: timezone });

  return dateInTz === tomorrowInTz;
};

/**
 * Type guard to check if an object is a CalendarEvent
 * @param obj - Object to check
 * @returns True if the object is a CalendarEvent, false otherwise
 */
export function isCalendarEvent(obj: any): obj is CalendarEvent {
  return obj && typeof obj.id === 'string' && typeof obj.title === 'string';
}

/**
 * Type guard to check if an object is a ChatMessage
 * @param obj - Object to check
 * @returns True if the object is a ChatMessage, false otherwise
 */
export function isChatMessage(obj: any): obj is ChatMessage {
  return obj && (obj.role === 'user' || obj.role === 'assistant') && typeof obj.content === 'string';
}