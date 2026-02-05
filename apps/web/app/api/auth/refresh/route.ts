import { NextRequest, NextResponse } from 'next/server';
import { db, users, eq } from '@repo/database';

/**
 * Token Refresh Endpoint
 * Allows frontend to get updated access token after it's been refreshed
 * This ensures the client always has the latest valid token
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const body = await req.json().catch(() => ({}));
    const { userId } = body;

    if (!authHeader && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let user;

    // Try to find user by userId first (most reliable)
    if (userId) {
      [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    }

    // Fallback: try to find by access token
    if (!user && authHeader) {
      const currentToken = authHeader.replace('Bearer ', '');
      [user] = await db
        .select()
        .from(users)
        .where(eq(users.googleAccessToken, currentToken))
        .limit(1);
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if we need to refresh the token from Google
    if (user.googleRefreshToken) {
      try {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
            client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
            refresh_token: user.googleRefreshToken,
            grant_type: 'refresh_token',
          }),
        });

        if (tokenResponse.ok) {
          const tokens = await tokenResponse.json();
          const newAccessToken = tokens.access_token;

          // Update the access token in database
          await db
            .update(users)
            .set({
              googleAccessToken: newAccessToken,
              lastActiveAt: new Date(),
            })
            .where(eq(users.id, user.id));

          return NextResponse.json({
            access_token: newAccessToken,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.image,
              role: user.role,
              calendarConnected: user.calendarConnected,
            },
          });
        } else {
          console.error('[Auth Refresh] Token refresh failed:', await tokenResponse.text());
        }
      } catch (error) {
        console.error('[Auth Refresh] Error refreshing token:', error);
      }
    }

    // Return the current access token (may be expired if refresh failed)
    return NextResponse.json({
      access_token: user.googleAccessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
        calendarConnected: user.calendarConnected,
      },
    });
  } catch (error) {
    console.error('Token refresh check error:', error);
    return NextResponse.json({ error: 'Failed to refresh token' }, { status: 500 });
  }
}
