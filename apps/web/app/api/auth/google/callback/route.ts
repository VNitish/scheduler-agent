import { NextRequest, NextResponse } from 'next/server';
import { db, users, userContext, eq } from '@repo/database';
import { CalendarService } from '@repo/calendar';

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();

    if (!code) {
      return NextResponse.json({ error: 'Authorization code required' }, { status: 400 });
    }

    // Exchange authorization code for tokens
    // Use 'postmessage' as redirect_uri for @react-oauth/google popup flow
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: 'postmessage',
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('Token exchange error:', errorData);
      return NextResponse.json({ error: 'Failed to exchange authorization code' }, { status: 401 });
    }

    const tokens = await tokenResponse.json();
    const { access_token, refresh_token } = tokens;

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userInfoResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch user info' }, { status: 401 });
    }

    const userInfo = await userInfoResponse.json();

    // Create or update user in database with both access and refresh tokens
    const [user] = await db
      .insert(users)
      .values({
        email: userInfo.email,
        name: userInfo.name,
        image: userInfo.picture,
        googleId: userInfo.id,
        googleAccessToken: access_token,
        googleRefreshToken: refresh_token,
        calendarConnected: true, // Calendar is now connected with the same OAuth
        lastActiveAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          googleAccessToken: access_token,
          // Only update refresh token if we got a new one (Google only sends it on first auth)
          ...(refresh_token ? { googleRefreshToken: refresh_token } : {}),
          calendarConnected: true,
          lastActiveAt: new Date(),
          image: userInfo.picture,
          name: userInfo.name,
        },
      })
      .returning();

    // Auto-detect timezone from Google Calendar and store in user context
    let detectedTimezone = 'UTC';
    try {
      const calendarService = new CalendarService(access_token, refresh_token);
      detectedTimezone = await calendarService.getTimezone();

      // Create or update user context with detected timezone
      const [existingContext] = await db
        .select()
        .from(userContext)
        .where(eq(userContext.userId, user.id))
        .limit(1);

      if (existingContext) {
        // Only update timezone if not already set (respect user's manual preference)
        if (!existingContext.timezone) {
          await db
            .update(userContext)
            .set({ timezone: detectedTimezone, updatedAt: new Date() })
            .where(eq(userContext.userId, user.id));
        }
      } else {
        // Create new user context with detected timezone and user's name
        await db.insert(userContext).values({
          userId: user.id,
          displayName: userInfo.name,
          timezone: detectedTimezone,
        });
      }
    } catch (tzError) {
      console.error('Error detecting timezone:', tzError);
      // Continue without timezone - not critical
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
        calendarConnected: user.calendarConnected,
        timezone: detectedTimezone,
      },
      access_token,
    });
  } catch (error) {
    console.error('Auth callback error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
