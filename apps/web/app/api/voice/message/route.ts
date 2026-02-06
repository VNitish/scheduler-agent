import { NextRequest, NextResponse } from 'next/server';
import { db, users, messages, conversations, eq } from '@repo/database';

/**
 * Records voice messages (user transcripts and assistant responses)
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userToken = authHeader.replace('Bearer ', '');

    // Explicit column selection to avoid schema mismatch issues
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.googleAccessToken, userToken))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await req.json();
    const { conversationId, role, content, toolCalls } = body;

    if (!conversationId) {
      return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
    }

    if (!content || (typeof content === 'string' && content.trim().length === 0)) {
      return NextResponse.json({ error: 'Missing or empty content' }, { status: 400 });
    }

    const messageRole = role === 'USER' ? 'USER' : 'ASSISTANT';

    // Verify conversation belongs to user — explicit column selection
    const [conversation] = await db
      .select({ id: conversations.id, userId: conversations.userId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation || conversation.userId !== user.id) {
      console.error(`[Voice] Conversation lookup failed: convId=${conversationId}, userId=${user.id}, found=${!!conversation}`);
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Store voice message
    const trimmedContent = typeof content === 'string' ? content.trim() : String(content);

    await db.insert(messages).values({
      conversationId,
      role: messageRole,
      content: trimmedContent,
      toolCalls: Array.isArray(toolCalls) && toolCalls.length > 0 ? toolCalls : null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Voice] Message insert error:', error);
    return NextResponse.json({ error: 'Failed to store voice message' }, { status: 500 });
  }
}
