import { NextRequest, NextResponse } from 'next/server';
import { db, users, userContext, eq } from '@repo/database';

// GET - Fetch user context
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
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

    // Get user context
    const [context] = await db
      .select()
      .from(userContext)
      .where(eq(userContext.userId, user.id))
      .limit(1);

    return NextResponse.json({
      context: context || null,
    });
  } catch (error) {
    console.error('Get context error:', error);
    return NextResponse.json({ error: 'Failed to fetch context' }, { status: 500 });
  }
}

// PUT - Update user context
export async function PUT(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
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

    const body = await req.json();

    // Check if context exists
    const [existingContext] = await db
      .select()
      .from(userContext)
      .where(eq(userContext.userId, user.id))
      .limit(1);

    let context;

    if (existingContext) {
      // Update existing context
      [context] = await db
        .update(userContext)
        .set({
          displayName: body.displayName,
          location: body.location,
          timezone: body.timezone,
          gender: body.gender,
          summary: body.summary,
          workingHoursStart: body.workingHoursStart,
          workingHoursEnd: body.workingHoursEnd,
          workingDays: body.workingDays,
          mealTimings: body.mealTimings,
          otherBlockedTimes: body.otherBlockedTimes,
          preferInPerson: body.preferInPerson,
          officeLocation: body.officeLocation,
          updatedAt: new Date(),
        })
        .where(eq(userContext.userId, user.id))
        .returning();
    } else {
      // Create new context
      [context] = await db
        .insert(userContext)
        .values({
          userId: user.id,
          displayName: body.displayName,
          location: body.location,
          timezone: body.timezone,
          gender: body.gender,
          summary: body.summary,
          workingHoursStart: body.workingHoursStart,
          workingHoursEnd: body.workingHoursEnd,
          workingDays: body.workingDays,
          mealTimings: body.mealTimings,
          otherBlockedTimes: body.otherBlockedTimes,
          preferInPerson: body.preferInPerson,
          officeLocation: body.officeLocation,
        })
        .returning();
    }

    return NextResponse.json({ context });
  } catch (error) {
    console.error('Update context error:', error);
    return NextResponse.json({ error: 'Failed to update context' }, { status: 500 });
  }
}
