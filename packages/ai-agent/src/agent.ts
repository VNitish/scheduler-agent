import OpenAI from 'openai';
// @ts-ignore - Temporary workaround for OpenAI types issue
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat';
import { SYSTEM_PROMPTS } from './prompts';

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AgentResponse {
  message: string;
  requiresInput: boolean;
  toolCalls?: ToolCall[];
  suggestions?: string[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
}


export interface UserContext {
  displayName?: string;
  location?: string;
  timezone?: string;
  gender?: string;
  summary?: string;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  workingDays?: number[];
  mealTimings?: {
    breakfast?: { start: string; end: string };
    lunch?: { start: string; end: string };
    dinner?: { start: string; end: string };
  };
  otherBlockedTimes?: Array<{
    name: string;
    start: string;
    end: string;
    days?: number[];
  }>;
  preferInPerson?: boolean;
  officeLocation?: string;
}

export interface UserContact {
  id: string;
  name: string;
  email?: string;
  nicknames?: string[];
  relation?: string;
  company?: string;
  timezone?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  attendees?: string[];
}

export interface AgentTools {
  checkAvailability?: (args: {
    duration: number;
    startDate: string;
    endDate: string;
    timePreference?: 'morning' | 'afternoon' | 'evening' | 'any';
    notBefore?: number;
    notAfter?: number;
    excludeDays?: number[];
    bufferBefore?: number;
    bufferAfter?: number;
  }) => Promise<any>;

  scheduleMeeting?: (args: {
    title: string;
    startTime: string;
    duration: number;
    attendees?: string[];
    description?: string;
  }) => Promise<any>;

  findCalendarEvent?: (args: {
    searchQuery: string;
    startDate?: string;
    endDate?: string;
  }) => Promise<any[]>;  // Returns serialized events with formatted times

  getLastMeetingOfDay?: (args: {
    date: string;
  }) => Promise<any | null>;  // Returns serialized event with formatted times

  getUserContext?: (args: {}) => Promise<{
    context: UserContext | null;
    contacts: UserContact[];
    recentMeetings: any[];
  } | null>;

  updateUserContext?: (args: {
    summary?: string;
    location?: string;
    timezone?: string;
    mealTimings?: {
      breakfast?: { start: string; end: string };
      lunch?: { start: string; end: string };
      dinner?: { start: string; end: string };
    };
    workingDays?: number[];
  }) => Promise<{ success: boolean }>;

  updateMeeting?: (args: {
    eventId: string;
    title?: string;
    description?: string;
    startTime?: string;
    duration?: number;
  }) => Promise<{ success: boolean; error?: string }>;

  deleteMeeting?: (args: {
    eventId: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

export class SchedulerAgent {
  private llm: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o-mini') {
    this.llm = new OpenAI({ apiKey });
    this.model = model;
  }

  async processMessage(
    userId: string,
    message: string,
    conversationHistory: AgentMessage[],
    tools?: AgentTools,
    userContext?: UserContext,
    userContacts?: UserContact[],
    recentMeetings?: any[]
  ): Promise<AgentResponse> {
    // Build context
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: this.getSystemPrompt(userContext, userContacts, recentMeetings),
      },
      ...conversationHistory.map(
        (msg) =>
          ({
            role: msg.role,
            content: msg.content,
          } as ChatCompletionMessageParam)
      ),
      {
        role: 'user',
        content: message,
      },
    ];


    // Define available tools
    const availableTools: ChatCompletionTool[] = this.getToolDefinitions();

    try {
      const response = await this.llm.chat.completions.create({
        model: this.model,
        messages,
        tools: availableTools,
        tool_choice: 'auto',
        temperature: 0.7,
      });

      const choice = response.choices[0];
      const toolCalls: ToolCall[] = [];

      // Handle tool calls
      if (choice.message.tool_calls) {
        for (const toolCall of choice.message.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          let result: any = { error: 'Tool not available' };

          switch (functionName) {
            case 'check_availability':
              if (tools?.checkAvailability) {
                result = await tools.checkAvailability(functionArgs);
              }
              break;
            case 'schedule_meeting':
              if (tools?.scheduleMeeting) {
                result = await tools.scheduleMeeting(functionArgs);
              }
              break;
            case 'find_calendar_event':
              if (tools?.findCalendarEvent) {
                result = await tools.findCalendarEvent(functionArgs);
              }
              break;
            case 'get_last_meeting_of_day':
              if (tools?.getLastMeetingOfDay) {
                result = await tools.getLastMeetingOfDay(functionArgs);
              }
              break;
            case 'get_user_context':
              if (tools?.getUserContext) {
                result = await tools.getUserContext(functionArgs);
              }
              break;
            case 'update_user_context':
              if (tools?.updateUserContext) {
                result = await tools.updateUserContext(functionArgs);
              }
              break;
            case 'update_meeting':
              if (tools?.updateMeeting) {
                result = await tools.updateMeeting(functionArgs);
              }
              break;
            case 'delete_meeting':
              if (tools?.deleteMeeting) {
                result = await tools.deleteMeeting(functionArgs);
              }
              break;
          }

          toolCalls.push({
            id: toolCall.id,
            name: functionName,
            arguments: functionArgs,
            result,
          });
        }

        // Get final response after tool execution
        const finalMessages: ChatCompletionMessageParam[] = [
          ...messages,
          choice.message as ChatCompletionMessageParam,
          ...toolCalls.map(
            (tc) =>
              ({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify(tc.result),
              } as ChatCompletionMessageParam)
          ),
        ];

        const finalResponse = await this.llm.chat.completions.create({
          model: this.model,
          messages: finalMessages,
          temperature: 0.7,
        });

        return {
          message: finalResponse.choices[0].message.content || '',
          requiresInput: true,
          toolCalls,
        };
      }

      return {
        message: choice.message.content || '',
        requiresInput: this.detectRequiresUserInput(choice.message.content || ''),
      };
    } catch (error) {
      console.error('Agent error:', error);
      return {
        message: "I'm sorry, I encountered an error. Please try again.",
        requiresInput: true,
      };
    }
  }

  private getToolDefinitions(): ChatCompletionTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'check_availability',
          description: 'Check user calendar for available time slots within a date range. Supports advanced constraints like time-of-day limits, excluding specific days, and buffer requirements.',
          parameters: {
            type: 'object',
            properties: {
              duration: {
                type: 'number',
                description: 'Meeting duration in minutes',
              },
              startDate: {
                type: 'string',
                description: 'Start date in ISO format (YYYY-MM-DD)',
              },
              endDate: {
                type: 'string',
                description: 'End date in ISO format (YYYY-MM-DD)',
              },
              timePreference: {
                type: 'string',
                enum: ['morning', 'afternoon', 'evening', 'any'],
                description: 'Preferred time of day',
              },
              notBefore: {
                type: 'number',
                description: 'Do not schedule before this hour (0-23). E.g., 9 means not before 9 AM',
              },
              notAfter: {
                type: 'number',
                description: 'Do not schedule after this hour (0-23). E.g., 17 means not after 5 PM',
              },
              excludeDays: {
                type: 'array',
                items: { type: 'number' },
                description: 'Days of week to exclude (0=Sunday, 1=Monday, ..., 6=Saturday)',
              },
              bufferBefore: {
                type: 'number',
                description: 'Required buffer time before the meeting in minutes',
              },
              bufferAfter: {
                type: 'number',
                description: 'Required buffer time after the meeting in minutes',
              },
            },
            required: ['duration', 'startDate', 'endDate'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'schedule_meeting',
          description: 'Create a meeting in the user calendar. Only call this after user confirms the time slot.',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Meeting title',
              },
              startTime: {
                type: 'string',
                description: 'Start time in ISO format YYYY-MM-DDTHH:MM:SS in the USER\'s LOCAL TIMEZONE. Do NOT convert to UTC. For example, if user says "10 AM" and their timezone is Asia/Kolkata, pass "2024-02-06T10:00:00" (not UTC converted).',
              },
              duration: {
                type: 'number',
                description: 'Duration in minutes',
              },
              attendees: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of attendee email addresses',
              },
              description: {
                type: 'string',
                description: 'Meeting description',
              },
            },
            required: ['title', 'startTime', 'duration'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'find_calendar_event',
          description: 'Search for a calendar event by name/title. Use this when user references an existing event like "after the Project Alpha meeting" or "before my flight".',
          parameters: {
            type: 'object',
            properties: {
              searchQuery: {
                type: 'string',
                description: 'Search term to find the event (e.g., "Project Alpha", "flight", "dentist")',
              },
              startDate: {
                type: 'string',
                description: 'Start date to search from (ISO format)',
              },
              endDate: {
                type: 'string',
                description: 'End date to search until (ISO format)',
              },
            },
            required: ['searchQuery'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_last_meeting_of_day',
          description: 'Get the last scheduled meeting on a specific day. Use this when user needs buffer time after their last meeting.',
          parameters: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'Date to check (ISO format YYYY-MM-DD)',
              },
            },
            required: ['date'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_user_context',
          description: 'Retrieve comprehensive user context including profile info, contacts, and recent meetings. Use this when you need to understand the user\'s current situation, preferences, or upcoming schedule.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_user_context',
          description: 'Update user\'s profile information and preferences. Use this when user wants to change their summary, location, timezone, meal timings, or working days. Only update the fields that the user specifically mentions.',
          parameters: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                description: 'Updated summary about the user',
              },
              location: {
                type: 'string',
                description: 'Updated location (city/country)',
              },
              timezone: {
                type: 'string',
                description: 'Updated timezone (e.g., Asia/Kolkata)',
              },
              mealTimings: {
                type: 'object',
                description: 'Updated meal timing preferences',
                properties: {
                  breakfast: {
                    type: 'object',
                    properties: {
                      start: { type: 'string' },
                      end: { type: 'string' },
                    },
                    description: 'Breakfast start and end times (HH:MM format)'
                  },
                  lunch: {
                    type: 'object',
                    properties: {
                      start: { type: 'string' },
                      end: { type: 'string' },
                    },
                    description: 'Lunch start and end times (HH:MM format)'
                  },
                  dinner: {
                    type: 'object',
                    properties: {
                      start: { type: 'string' },
                      end: { type: 'string' },
                    },
                    description: 'Dinner start and end times (HH:MM format)'
                  },
                },
              },
              workingDays: {
                type: 'array',
                items: { type: 'number' },
                description: 'Updated working days (0=Sunday, 1=Monday, etc.)',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_meeting',
          description: 'Update an existing calendar meeting. Use this to change the title, description, time, or duration of an existing event. You must first use find_calendar_event to get the event ID.',
          parameters: {
            type: 'object',
            properties: {
              eventId: {
                type: 'string',
                description: 'The Google Calendar event ID to update (obtained from find_calendar_event)',
              },
              title: {
                type: 'string',
                description: 'New title for the meeting',
              },
              description: {
                type: 'string',
                description: 'New description for the meeting',
              },
              startTime: {
                type: 'string',
                description: 'New start time in ISO 8601 format (only provide if changing time)',
              },
              duration: {
                type: 'number',
                description: 'New duration in minutes (required if changing startTime)',
              },
            },
            required: ['eventId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_meeting',
          description: 'Delete an existing calendar meeting. Use this when user wants to cancel or remove an event. You must first use find_calendar_event to get the event ID.',
          parameters: {
            type: 'object',
            properties: {
              eventId: {
                type: 'string',
                description: 'The Google Calendar event ID to delete (obtained from find_calendar_event)',
              },
            },
            required: ['eventId'],
          },
        },
      },
    ];
  }

  private replaceTemplatePlaceholders(template: string, replacements: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
  }

  private getSystemPrompt(userContext?: UserContext, userContacts?: UserContact[], recentMeetings?: any[]): string {
    const today = new Date();
    const userTimezone = userContext?.timezone || 'UTC';

    const dateStr = today.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: userTimezone,
    });
    const timeStr = today.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: userTimezone,
    });
    // Get ISO date in user's timezone (not UTC)
    const isoToday = today.toLocaleDateString('en-CA', { timeZone: userTimezone });

    // Build user context section
    let userContextSection = '';
    if (userContext) {
      const parts: string[] = [];

      if (userContext.displayName) {
        parts.push(`- Name: ${userContext.displayName}${userContext.gender ? ` (${userContext.gender})` : ''}`);
      }
      if (userContext.location) {
        parts.push(`- Location: ${userContext.location}`);
      }
      if (userContext.summary) {
        parts.push(`- About: ${userContext.summary}`);
      }
      if (userContext.workingHoursStart && userContext.workingHoursEnd) {
        const days = userContext.workingDays?.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ') || 'Mon-Fri';
        parts.push(`- Working Hours: ${userContext.workingHoursStart} to ${userContext.workingHoursEnd} (${days})`);
      }
      if (userContext.mealTimings) {
        const meals = userContext.mealTimings;
        const mealParts: string[] = [];
        if (meals.breakfast?.start && meals.breakfast?.end) mealParts.push(`breakfast ${meals.breakfast.start}-${meals.breakfast.end}`);
        if (meals.lunch?.start && meals.lunch?.end) mealParts.push(`lunch ${meals.lunch.start}-${meals.lunch.end}`);
        if (meals.dinner?.start && meals.dinner?.end) mealParts.push(`dinner ${meals.dinner.start}-${meals.dinner.end}`);
        if (mealParts.length > 0) {
          parts.push(`- Blocked meal times: ${mealParts.join(', ')}`);
        }
      }
      if (userContext.officeLocation) {
        parts.push(`- Office: ${userContext.officeLocation}`);
      }

      if (parts.length > 0) {
        userContextSection = `\n\n## USER PROFILE\n${parts.join('\n')}`;
      }
    }

    // Build contacts section
    let contactsSection = '';
    if (userContacts && userContacts.length > 0) {
      const contactLines = userContacts.map(c => {
        const parts: string[] = [`"${c.name}"`];
        if (c.nicknames && c.nicknames.length > 0) {
          parts.push(`(also called: ${c.nicknames.join(', ')})`);
        }
        if (c.email) parts.push(`- email: ${c.email}`);
        if (c.relation) parts.push(`- ${c.relation}`);
        if (c.company) parts.push(`at ${c.company}`);
        if (c.timezone) parts.push(`- timezone: ${c.timezone}`);
        return `  - ${parts.join(' ')}`;
      });
      contactsSection = `\n\n## USER'S CONTACTS (use for scheduling)\nWhen the user mentions a name or nickname below, use the associated email for meeting invites:\n${contactLines.join('\n')}`;
    }

    // Build recent meetings section
    let recentMeetingsSection = '';
    if (recentMeetings && recentMeetings.length > 0) {
      const meetingLines = recentMeetings.map((meeting) => {
        // Ensure meeting.startTime is a valid date string before converting
        const startTimeStr = typeof meeting.startTime === 'string' ? meeting.startTime : meeting.startTime?.toISOString?.() || '';

        try {
          const startTime = new Date(startTimeStr).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: userTimezone, // Use user's timezone
          });

          return `- ${meeting.title} (${startTime})`;
        } catch (error) {
          return `- ${meeting.title} (date formatting error)`;
        }
      });
      recentMeetingsSection = `\n\n## RECENT MEETINGS (Last 7 Days)\n${meetingLines.join('\n')}`;
    }

    // Determine timezone display format
    const timezoneDisplay = userTimezone === 'Asia/Kolkata' ? 'IST (Asia/Kolkata, UTC+5:30)' : userTimezone;

    // Prepare replacements for the template
    const replacements = {
      DATE: `${dateStr} (${isoToday})`,
      TIME: timeStr,
      TIMEZONE: timezoneDisplay,
      CONTEXT: userContextSection,
      CONTACTS: contactsSection,
      RECENT_MEETINGS: recentMeetingsSection,
      NEXT_WEEK_RANGE: this.getNextWeekRange(today, userTimezone),
      THIS_WEEK_RANGE: this.getThisWeekRange(today, userTimezone),
      END_OF_MONTH: this.getEndOfMonth(today, userTimezone)
    };

    // Replace placeholders in the centralized prompt
    return this.replaceTemplatePlaceholders(SYSTEM_PROMPTS.TEXT_AGENT, replacements);
  }

  private getNextWeekRange(today: Date, timezone: string): string {
    const nextMonday = new Date(today);
    const dayOfWeek = today.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    nextMonday.setDate(today.getDate() + daysUntilMonday);

    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);

    // Format dates in user's timezone
    const formatDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: timezone });
    return `${formatDate(nextMonday)} to ${formatDate(nextSunday)}`;
  }

  private getThisWeekRange(today: Date, timezone: string): string {
    const startOfWeek = new Date(today);
    const dayOfWeek = today.getDay();
    startOfWeek.setDate(today.getDate() - dayOfWeek);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    // Format dates in user's timezone
    const formatDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: timezone });
    return `${formatDate(startOfWeek)} to ${formatDate(endOfWeek)}`;
  }

  private getEndOfMonth(today: Date, timezone: string): string {
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return endOfMonth.toLocaleDateString('en-CA', { timeZone: timezone });
  }

  private detectRequiresUserInput(message: string): boolean {
    const questionPatterns = ['?', 'which', 'what', 'when', 'where', 'who', 'how', 'would you', 'prefer', 'like'];
    return questionPatterns.some((pattern) => message.toLowerCase().includes(pattern));
  }
}
