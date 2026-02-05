import { pgTable, text, timestamp, integer, boolean, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const meetingStatusEnum = pgEnum('meeting_status', ['SCHEDULED', 'CANCELLED', 'COMPLETED']);
export const creationSourceEnum = pgEnum('creation_source', ['CHAT', 'OPENAI_VOICE', 'ELEVENLABS_VOICE']);
export const conversationTypeEnum = pgEnum('conversation_type', ['TEXT', 'OPENAI_VOICE', 'ELEVENLABS_VOICE']);
export const conversationStatusEnum = pgEnum('conversation_status', [
  'ACTIVE',
  'COMPLETED',
  'ABANDONED',
]);
export const messageRoleEnum = pgEnum('message_role', ['USER', 'ASSISTANT', 'SYSTEM', 'TOOL']);
export const userRoleEnum = pgEnum('role', ['USER', 'ADMIN']);

// Users table
export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  role: userRoleEnum('role').default('USER').notNull(),

  // Google OAuth
  googleId: text('google_id').unique(),
  googleAccessToken: text('google_access_token'),
  googleRefreshToken: text('google_refresh_token'),
  tokenExpiry: timestamp('token_expiry'),

  // Session management (separate from Google OAuth)
  sessionToken: text('session_token').unique(),
  sessionExpiry: timestamp('session_expiry'),

  // Calendar
  calendarConnected: boolean('calendar_connected').default(false),
  calendarId: text('calendar_id'),

  // User preferences
  preferences: jsonb('preferences').$type<{
    timezone?: string;
    defaultMeetingDuration?: number;
    workingHours?: { start: number; end: number };
  }>(),

  // Metrics
  totalMeetings: integer('total_meetings').default(0),
  totalVoiceCalls: integer('total_voice_calls').default(0),
  lastActiveAt: timestamp('last_active_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Meetings table
export const meetings = pgTable('meetings', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Meeting details
  title: text('title').notNull(),
  description: text('description'),
  duration: integer('duration').notNull(), // minutes
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),

  // Calendar sync
  googleEventId: text('google_event_id'),
  calendarSynced: boolean('calendar_synced').default(false),

  // Attendees
  attendees: jsonb('attendees').$type<string[]>(),

  // Status
  status: meetingStatusEnum('status').default('SCHEDULED').notNull(),
  createdVia: creationSourceEnum('created_via').default('CHAT').notNull(),

  conversationId: text('conversation_id').references(() => conversations.id),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Conversations table
export const conversations = pgTable('conversations', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  type: conversationTypeEnum('type').notNull(),
  status: conversationStatusEnum('status').default('ACTIVE').notNull(),

  // Session duration (seconds) — tracked for all conversation types
  callDuration: integer('call_duration'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Messages table
export const messages = pgTable('messages', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),

  role: messageRoleEnum('role').notNull(),
  content: text('content').notNull(),

  // Voice message
  audioUrl: text('audio_url'),
  transcription: text('transcription'),

  // Tool calls
  toolCalls: jsonb('tool_calls').$type<
    Array<{
      name: string;
      arguments: Record<string, any>;
      result?: any;
    }>
  >(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Conversation Evaluations table (for tracking eval scores and metrics)
export const conversationEvaluations = pgTable('conversation_evaluations', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  conversationId: text('conversation_id')
    .notNull()
    .unique()
    .references(() => conversations.id, { onDelete: 'cascade' }),

  // Eval scores (0-100)
  overallScore: integer('overall_score'),
  clarityScore: integer('clarity_score'),
  helpfulnessScore: integer('helpfulness_score'),
  accuracyScore: integer('accuracy_score'),
  efficiencyScore: integer('efficiency_score'),

  // Aggregated metrics
  totalMessages: integer('total_messages'),
  toolCallCount: integer('tool_call_count'),

  // Eval metadata
  evalRawResponse: text('eval_raw_response'),
  evaluatedAt: timestamp('evaluated_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// User Context table (profile and scheduling preferences)
export const userContext = pgTable('user_context', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Basic Info
  displayName: text('display_name'),
  location: text('location'), // City/Country for timezone inference
  timezone: text('timezone'), // e.g., 'Asia/Kolkata'
  gender: text('gender'),
  summary: text('summary'), // 3-line summary about the user

  // Working Hours
  workingHoursStart: text('working_hours_start'), // e.g., '09:00'
  workingHoursEnd: text('working_hours_end'), // e.g., '18:00'
  workingDays: jsonb('working_days').$type<number[]>(), // 0-6 (Sun-Sat)

  advanceBookingDays: integer('advance_booking_days'), // how far ahead to schedule

  // Blocked Times
  mealTimings: jsonb('meal_timings').$type<{
    breakfast?: { start: string; end: string };
    lunch?: { start: string; end: string };
    dinner?: { start: string; end: string };
  }>(),
  otherBlockedTimes: jsonb('other_blocked_times').$type<
    Array<{
      name: string;
      start: string;
      end: string;
      days?: number[]; // which days this applies to
    }>
  >(),

  // Platform Preferences
  preferInPerson: boolean('prefer_in_person').default(false),
  officeLocation: text('office_location'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// User Contacts table (phonebook)
export const userContacts = pgTable('user_contacts', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Basic Info
  name: text('name').notNull(),
  email: text('email').notNull(),
  nicknames: jsonb('nicknames').$type<string[]>().notNull(),

  // Relationship
  relation: text('relation').notNull(),
  company: text('company'),

  // Scheduling Preferences for this contact
  timezone: text('timezone').notNull(),

  // Tracking
  lastMetAt: timestamp('last_met_at'),
  meetingCount: integer('meeting_count').default(0),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  meetings: many(meetings),
  conversations: many(conversations),
  context: one(userContext),
  contacts: many(userContacts),
}));

export const userContextRelations = relations(userContext, ({ one }) => ({
  user: one(users, {
    fields: [userContext.userId],
    references: [users.id],
  }),
}));

export const userContactsRelations = relations(userContacts, ({ one }) => ({
  user: one(users, {
    fields: [userContacts.userId],
    references: [users.id],
  }),
}));

export const meetingsRelations = relations(meetings, ({ one }) => ({
  user: one(users, {
    fields: [meetings.userId],
    references: [users.id],
  }),
  conversation: one(conversations, {
    fields: [meetings.conversationId],
    references: [conversations.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  messages: many(messages),
  meetings: many(meetings),
  evaluation: one(conversationEvaluations),
}));

export const conversationEvaluationsRelations = relations(conversationEvaluations, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationEvaluations.conversationId],
    references: [conversations.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type UserContext = typeof userContext.$inferSelect;
export type NewUserContext = typeof userContext.$inferInsert;
export type UserContact = typeof userContacts.$inferSelect;
export type NewUserContact = typeof userContacts.$inferInsert;
export type ConversationEvaluation = typeof conversationEvaluations.$inferSelect;
export type NewConversationEvaluation = typeof conversationEvaluations.$inferInsert;
