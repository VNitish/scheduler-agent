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



### 3. Voice Agent Integration

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

### 4. Conversation Evaluation

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

## Design Choices & How It Works

### Agent Architecture

The scheduler agent follows a **tool-calling LLM pattern** where the AI model acts as an orchestrator that decides which actions to take based on user input:

1. **User sends a message** → "Schedule a meeting with John tomorrow at 2pm"
2. **LLM analyzes intent** → Determines this requires checking availability and creating an event
3. **Tool execution** → Agent calls `check_availability`, then `schedule_meeting`
4. **Response generation** → LLM formats the result in natural language

This approach was chosen over hardcoded workflows because it allows the agent to handle novel requests without explicit programming for every scenario.

### Why This Stack?

| Choice | Reasoning |
|--------|-----------|
| **Next.js 15 (App Router)** | Server components reduce client bundle, API routes colocate with frontend |
| **Turborepo Monorepo** | Shared packages (ai-agent, calendar, database) avoid code duplication |
| **Drizzle ORM** | Type-safe database queries, lightweight, great DX |
| **PostgreSQL** | Reliable, supports JSON for flexible schema (preferences, contacts) |

### Timezone Handling

All times are stored in UTC but displayed in the user's timezone. When a user logs in, their timezone is auto-detected from Google Calendar settings and stored in their profile. The agent's system prompt includes the current time in the user's timezone to ensure accurate scheduling.

### Voice Integration Design

Two voice providers are supported to demonstrate different integration patterns:

- **OpenAI Realtime API**: Direct WebRTC connection, native tool calling, lowest latency
- **ElevenLabs Conversational AI**: WebSocket-based, superior voice quality, client-side tool execution

Both share the same backend tool handlers (`/api/voice/tools`), ensuring consistent behavior regardless of voice provider.

---

## Getting Started

### Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** installed ([download](https://nodejs.org/))
- **PostgreSQL** database running locally or a cloud instance (e.g., Supabase, Neon)
- **Google Cloud Console** project with Calendar API enabled
- **OpenAI API key** ([get one](https://platform.openai.com/api-keys))
- **ElevenLabs account** (optional, for voice features)

### Step 1: Clone the Repository

```bash
git clone https://github.com/VNitish/scheduler-agent.git
cd scheduler-agent
```

### Step 2: Install Dependencies

```bash
npm install
```

This installs all dependencies for the monorepo including the web app and shared packages.

### Step 3: Set Up Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Google Calendar API**:
   - Navigate to APIs & Services → Library
   - Search for "Google Calendar API" and enable it
4. Configure OAuth consent screen:
   - Go to APIs & Services → OAuth consent screen
   - Choose "External" user type
   - Fill in app name, support email
   - Add scopes: `openid`, `email`, `profile`, `calendar`, `calendar.events`
5. Create OAuth credentials:
   - Go to APIs & Services → Credentials
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Web application"
   - Add authorized JavaScript origins: `http://localhost:3000`
   - Add authorized redirect URIs: `http://localhost:3000`
   - Copy the Client ID and Client Secret

### Step 4: Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Database (PostgreSQL connection string)
DATABASE_URL="postgresql://user:password@localhost:5432/scheduler"

# Google OAuth (from Step 3)
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
NEXT_PUBLIC_GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"

# OpenAI API Key
OPENAI_API_KEY="sk-..."

# ElevenLabs (optional - for voice features)
ELEVENLABS_API_KEY="your-elevenlabs-key"
ELEVENLABS_AGENT_ID="your-agent-id"
```

### Step 5: Set Up the Database

```bash
# Push the schema to your database
npm run db:push
```

This creates all necessary tables (users, meetings, conversations, messages, etc.).

### Step 6: Run the Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

### Step 7: Sign In and Connect Calendar

1. Open `http://localhost:3000`
2. Click "Sign in with Google"
3. Grant calendar permissions when prompted
4. Your timezone will be auto-detected from Google Calendar
5. Start chatting with the agent!

### Optional: Set Up ElevenLabs Voice Agent

If you want voice features with ElevenLabs:

1. Create an account at [ElevenLabs](https://elevenlabs.io/)
2. Go to Conversational AI → Create Agent
3. Configure the agent with the system prompt and tools (see docs)
4. Copy the Agent ID to your `.env` file
5. The voice button will appear in the dashboard

## Technical Highlights

- **Timezone-Aware**: All date/time operations respect the user's timezone
- **Auto Token Refresh**: OAuth tokens are automatically refreshed for uninterrupted calendar access
- **Monorepo Architecture**: Turborepo enables shared packages, parallel builds, and clear separation of concerns

