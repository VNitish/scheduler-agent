import { NextRequest, NextResponse } from 'next/server';
import { db, users, eq } from '@repo/database';

export async function POST(req: NextRequest) {
  try {
    const { access_token } = await req.json();
    const authHeader = req.headers.get('authorization');

    if (!authHeader || !access_token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userToken = authHeader.replace('Bearer ', '');

    // Find user by access token
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.googleAccessToken, userToken))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update user with calendar access
    await db
      .update(users)
      .set({
        calendarConnected: true,
        googleAccessToken: access_token,
      })
      .where(eq(users.id, user.id));

    return NextResponse.json({
      success: true,
      message: 'Calendar connected successfully',
    });
  } catch (error) {
    console.error('Calendar connect error:', error);
    return NextResponse.json({ error: 'Failed to connect calendar' }, { status: 500 });
  }
}
