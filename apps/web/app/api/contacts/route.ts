import { NextRequest, NextResponse } from 'next/server';
import { db, users, userContacts, eq } from '@repo/database';

// GET - Fetch all contacts
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

    // Get all contacts for user
    const contacts = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.userId, user.id))
      .orderBy(userContacts.name);

    return NextResponse.json({ contacts });
  } catch (error) {
    console.error('Get contacts error:', error);
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
  }
}

// POST - Create a new contact
export async function POST(req: NextRequest) {
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

    if (!body.name || !body.email || !body.relation || !body.timezone) {
      return NextResponse.json({ error: 'Name, email, relation, and timezone are required' }, { status: 400 });
    }

    const [contact] = await db
      .insert(userContacts)
      .values({
        userId: user.id,
        name: body.name,
        email: body.email,
        nicknames: body.nicknames || [],
        relation: body.relation,
        company: body.company,
        timezone: body.timezone,
      })
      .returning();

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    console.error('Create contact error:', error);
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }
}
