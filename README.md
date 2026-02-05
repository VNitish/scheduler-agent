# Scheduler Agent

An intelligent AI-powered scheduling assistant that understands natural language, manages your calendar, and learns your preferences. Built with agentic AI principles for autonomous task completion.

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4-green)
![ElevenLabs](https://img.shields.io/badge/ElevenLabs-Voice-purple)

## Overview

Scheduler Agent is a full-stack application that demonstrates modern agentic AI patterns. Unlike traditional chatbots that simply respond to queries, this agent autonomously executes multi-step tasks, maintains context across conversations, and adapts to user preferences.

### Key Agentic Capabilities

- **Autonomous Task Execution**: The agent doesn't just answer questions—it takes actions. When you say "schedule a meeting with John tomorrow at 2pm," it checks availability, finds John's email from your contacts, creates the calendar event, and confirms the booking.

- **Tool Calling Architecture**: The agent has access to a suite of tools it can invoke to accomplish tasks, making real-time decisions about which tools to use and in what sequence.

- **Context Persistence**: The agent remembers your preferences, working hours, contacts, and past interactions to provide personalized assistance.

- **Multi-Modal Interaction**: Interact via text chat or real-time voice conversations using OpenAI Realtime API or ElevenLabs Conversational AI.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                           │
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │  Text Chat  │  │  OpenAI Voice   │  │  ElevenLabs Voice   │ │
│  └──────┬──────┘  └────────┬────────┘  └──────────┬──────────┘ │
└─────────┼──────────────────┼─────────────────────┼─────────────┘
          │                  │                      │
          ▼                  ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                       AI Agent Core                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    System Prompt                            │ │
│  │  • Current date/time (timezone-aware)                       │ │
│  │  • User context (working hours, preferences)                │ │
│  │  • Contact list                                             │ │
│  │  • Recent meetings                                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Tool Registry                            │ │
│  │  check_availability | schedule_meeting | update_meeting     │ │
│  │  delete_meeting | find_calendar_event | get_meetings        │ │
│  │  get_user_context | update_user_context | manage_contacts   │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External Services                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Google Calendar │  │    OpenAI API   │  │   ElevenLabs    │ │
│  │       API       │  │   (GPT-4 + RT)  │  │  Conversational │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Agentic Features Deep Dive

### 1. Tool Calling System

The agent operates through a sophisticated tool-calling mechanism. When processing a request, the LLM decides which tools to invoke and with what parameters.

```typescript
// Available Tools
{
  checkAvailability: {
    description: "Find available time slots",
    parameters: { duration, startDate, endDate, timePreference, excludeDays, notBefore, notAfter }
  },
  scheduleMeeting: {
    description: "Create a calendar event",
    parameters: { title, startTime, duration, attendees, description }
  },
  findCalendarEvent: {
    description: "Search for existing events by title",
    parameters: { query, startDate, endDate }
  },
  // ... more tools
}
```

**Example Flow:**
```
User: "Schedule a 30-minute sync with Sarah tomorrow, not too early"

Agent reasoning:
1. Parse intent: schedule meeting
2. Identify constraints: 30 min, tomorrow, morning avoided
3. Look up Sarah's email from contacts
4. Call checkAvailability(duration: 30, startDate: tomorrow, notBefore: 10)
5. Present options to user
6. On selection, call scheduleMeeting(...)
```

### 2. Contextual Understanding

The agent maintains rich context about the user:

```typescript
interface UserContext {
  timezone: string;              // "Asia/Kolkata"
  workingHoursStart: number;     // 9
  workingHoursEnd: number;       // 18
  workingDays: number[];         // [1,2,3,4,5] (Mon-Fri)
  preferredMeetingDuration: number;
  bufferBetweenMeetings: number;
  mealTimings: {
    lunch: { start: string, end: string }
  };
  summary: string;               // Free-form notes about the user
}
```

This context is injected into every conversation, enabling responses like:
- "I see you prefer not to schedule meetings during your lunch break (1-2 PM)"
- "Since you work Monday through Friday, I'll look at next week's availability"

### 3. Relative Time Resolution

The agent understands complex temporal references:

| User Says | Agent Understands |
|-----------|-------------------|
| "before my flight on Friday" | Finds the flight event, schedules before it |
| "a day after the kickoff" | Locates "kickoff" event, adds 1 day |
| "last weekday of the month" | Calculates the exact date |
| "not too early" | Applies notBefore: 9 or 10 AM |
| "usual sync-up time" | References user's meeting patterns |

### 4. Voice Agent Integration

Two voice interfaces demonstrate different approaches to conversational AI:

**OpenAI Realtime API:**
- WebRTC-based real-time audio streaming
- Native function calling support
- Low-latency voice-to-voice interaction

**ElevenLabs Conversational AI:**
- WebSocket-based audio streaming
- Custom tool execution
- Natural-sounding voice synthesis

Both voice agents share the same tool registry as the text chat, ensuring consistent behavior across modalities.

### 5. Conversation Evaluation

Built-in evaluation system scores conversations on:

| Metric | Description |
|--------|-------------|
| **Clarity** | How clear and understandable were the responses? |
| **Helpfulness** | Did the agent successfully help the user? |
| **Accuracy** | Were scheduled times and details correct? |
| **Efficiency** | Was the task completed with minimal back-and-forth? |

This enables continuous improvement of prompts and agent behavior.

## Project Structure

```
scheduler-agent/
├── apps/
│   └── web/                    # Next.js 15 application
│       ├── app/
│       │   ├── api/
│       │   │   ├── chat/       # Text chat endpoints
│       │   │   ├── voice/      # Voice session endpoints
│       │   │   ├── calendar/   # Calendar operations
│       │   │   └── eval/       # Evaluation endpoints
│       │   ├── dashboard/      # Main application UI
│       │   ├── context/        # User preferences page
│       │   └── eval/           # Evaluation dashboard
│       └── lib/
├── packages/
│   ├── ai-agent/               # Core agent logic
│   │   ├── agent.ts            # Agent orchestration
│   │   ├── prompts.ts          # System prompts
│   │   └── time-parser.ts      # Temporal parsing
│   ├── calendar/               # Google Calendar integration
│   ├── voice/                  # Voice client implementations
│   │   ├── openai-realtime.ts  # OpenAI Realtime client
│   │   └── elevenlabs-realtime.ts
│   ├── database/               # Drizzle ORM schemas
│   ├── auth/                   # Google OAuth
│   └── ui/                     # Shared UI components
├── turbo.json                  # Turborepo config
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Google Cloud Console project with Calendar API enabled
- OpenAI API key
- ElevenLabs API key (optional, for voice)

### Environment Variables

Create a `.env.local` file in `apps/web/`:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/scheduler"

# Google OAuth
GOOGLE_CLIENT_ID="your-client-id"
GOOGLE_CLIENT_SECRET="your-client-secret"
NEXT_PUBLIC_GOOGLE_CLIENT_ID="your-client-id"

# OpenAI
OPENAI_API_KEY="sk-..."

# ElevenLabs (optional)
ELEVENLABS_API_KEY="your-key"
ELEVENLABS_AGENT_ID="your-agent-id"
```

### Installation

```bash
# Install dependencies
npm install

# Set up database
npm run db:push

# Start development server
npm run dev
```

Visit `http://localhost:3000` and sign in with Google.

## Usage Examples

### Text Chat

```
You: Schedule a team standup for tomorrow at 10am
Agent: I've scheduled "Team Standup" for tomorrow (Tuesday, Feb 7) at 10:00 AM.
       The meeting is set for 30 minutes. Would you like to add any attendees?

You: Add john@company.com and sarah@company.com
Agent: Done! I've added John and Sarah to the meeting. They'll receive calendar invites.
```

### Complex Scheduling

```
You: Find time for a 1-hour planning session next week, but not Wednesday,
     and preferably in the afternoon after my lunch break

Agent: Based on your calendar and preferences (lunch 1-2 PM), here are available slots:
       1. Monday 2:00 PM - 3:00 PM
       2. Tuesday 3:00 PM - 4:00 PM
       3. Friday 2:30 PM - 3:30 PM

       Which works best for you?
```

### Context-Aware Responses

```
You: Move my 3pm to after the client call

Agent: I found your "Project Review" at 3:00 PM and the "Client Call" ending at 4:30 PM.
       I've rescheduled "Project Review" to 4:45 PM (with your usual 15-min buffer).
       Does this work?
```

## Technical Highlights

### Timezone-Aware Date Handling

All date/time operations respect the user's timezone:

```typescript
// Correctly handles "10 AM tomorrow" in user's timezone
const userTimezone = context.timezone; // "Asia/Kolkata"
const slots = await calendarService.findAvailableSlots(
  duration,
  startDate,
  endDate,
  timePreference,
  userTimezone  // Times interpreted in user's timezone
);
```

### Token Refresh Flow

Automatic OAuth token refresh ensures uninterrupted calendar access:

```typescript
const calendarService = new CalendarService(
  accessToken,
  refreshToken,
  async (newTokens) => {
    // Automatically persist refreshed tokens
    await db.update(users).set({
      googleAccessToken: newTokens.access_token
    });
  }
);
```

### Monorepo Benefits

Using Turborepo enables:
- Shared packages across web and potential mobile apps
- Parallel builds and caching
- Clear separation of concerns
- Easy testing of individual packages

## Contributing

Contributions are welcome! Areas of interest:

- Additional calendar providers (Outlook, Apple Calendar)
- More sophisticated scheduling algorithms
- Meeting preparation features (agenda generation)
- Integration with video conferencing (Zoom, Meet)

## License

MIT

---

Built with modern agentic AI patterns to demonstrate autonomous task completion, tool use, and context-aware assistance.
