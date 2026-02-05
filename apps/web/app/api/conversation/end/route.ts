import { NextRequest, NextResponse } from 'next/server';
import { db, users, conversations, eq } from '@repo/database';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userToken = authHeader.replace('Bearer ', '');

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.googleAccessToken, userToken))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { conversationId, duration } = await req.json();

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation || conversation.userId !== user.id) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    if (conversation.status === 'COMPLETED') {
      return NextResponse.json({ success: true });
    }

    // Calculate duration: use provided value (voice) or compute from createdAt (text)
    const sessionDuration = typeof duration === 'number'
      ? duration
      : Math.floor((Date.now() - new Date(conversation.createdAt).getTime()) / 1000);

    await db
      .update(conversations)
      .set({
        status: 'COMPLETED',
        callDuration: sessionDuration,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('End conversation error:', error);
    return NextResponse.json({ error: 'Failed to end conversation' }, { status: 500 });
  }
}
