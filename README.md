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

**Available Tools:**

| Tool | Description |
|------|-------------|
| `checkAvailability` | Find available time slots with filters (duration, date range, time preference, exclude days) |
| `scheduleMeeting` | Create a new calendar event with title, time, duration, and attendees |
| `findCalendarEvent` | Search for existing events by title or query |
| `getLastMeetingOfDay` | Get the last meeting on a specific day |
| `updateMeeting` | Modify an existing meeting (title, time, duration) |
| `deleteMeeting` | Remove a meeting from the calendar |
| `getUserContext` | Retrieve user preferences and settings |
| `updateUserContext` | Update user preferences |
| `get_meetings` | Get meetings for a specific date |
| `get_todays_meetings` | Get all meetings scheduled for today |
| `add_contact` | Add a new contact with name, email, nickname |
| `update_contact` | Update existing contact information |
| `get_contacts` | Search or list saved contacts |

### 2. Contextual Understanding

The agent maintains rich context about the user including timezone, working hours, working days, preferred meeting duration, buffer times, meal timings, and personal notes. This context is injected into every conversation for personalized assistance.

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

## Technical Highlights

- **Timezone-Aware**: All date/time operations respect the user's timezone
- **Auto Token Refresh**: OAuth tokens are automatically refreshed for uninterrupted calendar access
- **Monorepo Architecture**: Turborepo enables shared packages, parallel builds, and clear separation of concerns

