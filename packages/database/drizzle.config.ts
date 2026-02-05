import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env file from root directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export default {
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Filter to only include our app tables, excluding Supabase system tables
  tablesFilter: ['users', 'meetings', 'conversations', 'messages', 'user_context', 'user_contacts', 'conversation_evaluations'],
} satisfies Config;
