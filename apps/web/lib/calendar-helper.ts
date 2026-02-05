import { db, users, eq } from '@repo/database';
import { CalendarService } from '@repo/calendar';

/**
 * Initialize CalendarService with automatic token refresh
 * This helper ensures all routes consistently handle token refresh
 */
export async function createCalendarService(
  userId: string,
  accessToken: string,
  refreshToken?: string
): Promise<CalendarService> {
  return new CalendarService(
    accessToken,
    refreshToken,
    // Token refresh callback - automatically updates database
    async (tokens) => {
      if (tokens.access_token) {
        await db
          .update(users)
          .set({
            googleAccessToken: tokens.access_token,
            tokenExpiry: (tokens as any).expiry_date ? new Date((tokens as any).expiry_date) : undefined,
          })
          .where(eq(users.id, userId));
      }
      if (tokens.refresh_token) {
        await db
          .update(users)
          .set({ googleRefreshToken: tokens.refresh_token })
          .where(eq(users.id, userId));
      }
    }
  );
}

/**
 * Find user by access token and return with calendar service
 */
export async function getUserWithCalendar(accessToken: string): Promise<{
  user: any;
  calendarService: CalendarService | null;
}> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.googleAccessToken, accessToken))
    .limit(1);

  if (!user) {
    throw new Error('User not found');
  }

  let calendarService: CalendarService | null = null;

  if (user.calendarConnected && user.googleAccessToken) {
    calendarService = await createCalendarService(
      user.id,
      user.googleAccessToken,
      user.googleRefreshToken || undefined
    );
  }

  return { user, calendarService };
}
