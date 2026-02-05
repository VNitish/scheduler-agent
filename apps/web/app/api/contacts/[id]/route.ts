import { NextRequest, NextResponse } from 'next/server';
import { db, users, userContacts, eq, and } from '@repo/database';

// PUT - Update a contact
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Update contact (ensuring it belongs to the user)
    const [contact] = await db
      .update(userContacts)
      .set({
        name: body.name,
        email: body.email,
        nicknames: body.nicknames,
        relation: body.relation,
        company: body.company,
        timezone: body.timezone,
        lastMetAt: body.lastMetAt ? new Date(body.lastMetAt) : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(userContacts.id, id), eq(userContacts.userId, user.id)))
      .returning();

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('Update contact error:', error);
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
  }
}

// DELETE - Delete a contact
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Delete contact (ensuring it belongs to the user)
    const [deleted] = await db
      .delete(userContacts)
      .where(and(eq(userContacts.id, id), eq(userContacts.userId, user.id)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete contact error:', error);
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 });
  }
}
