import { NextRequest, NextResponse } from 'next/server';
import { db, users, conversations, messages, conversationEvaluations, eq, desc, and, sql } from '@repo/database';
import { evaluateConversation } from '../../../lib/evaluation';

/**
 * GET - List all conversations with evaluation status
 * Query params: page, limit, type (TEXT/OPENAI_VOICE/ELEVENLABS_VOICE)
 */
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

    // Parse query params
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const type = searchParams.get('type') as 'TEXT' | 'OPENAI_VOICE' | 'ELEVENLABS_VOICE' | null;
    const offset = (page - 1) * limit;

    // Build query conditions
    const conditions = [eq(conversations.userId, user.id)];
    if (type) {
      conditions.push(eq(conversations.type, type));
    }

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(conversations)
      .where(and(...conditions));
    const totalCount = Number(countResult[0]?.count || 0);

    // Get conversations with message counts
    const conversationList = await db
      .select({
        id: conversations.id,
        type: conversations.type,
        status: conversations.status,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.createdAt))
      .limit(limit)
      .offset(offset);

    // Get message counts and evaluations for each conversation
    const conversationsWithDetails = await Promise.all(
      conversationList.map(async (conv) => {
        // Get message stats
        const messageStats = await db
          .select({
            count: sql<number>`count(*)`,
            toolCallCount: sql<number>`count(case when ${messages.toolCalls} is not null then 1 end)`,
          })
          .from(messages)
          .where(eq(messages.conversationId, conv.id));

        // Get evaluation if exists
        const [evaluation] = await db
          .select()
          .from(conversationEvaluations)
          .where(eq(conversationEvaluations.conversationId, conv.id))
          .limit(1);

        return {
          ...conv,
          messageCount: Number(messageStats[0]?.count || 0),
          toolCallCount: Number(messageStats[0]?.toolCallCount || 0),
          evaluation: evaluation ? {
            overallScore: evaluation.overallScore,
            clarityScore: evaluation.clarityScore,
            helpfulnessScore: evaluation.helpfulnessScore,
            accuracyScore: evaluation.accuracyScore,
            efficiencyScore: evaluation.efficiencyScore,
            evaluatedAt: evaluation.evaluatedAt,
          } : null,
        };
      })
    );

    return NextResponse.json({
      conversations: conversationsWithDetails,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Eval list error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }
}

/**
 * POST - Trigger deep evaluation for a conversation
 */
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

    const { conversationId } = await req.json();

    if (!conversationId) {
      return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
    }

    // Verify conversation belongs to user
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation || conversation.userId !== user.id) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Get all messages for the conversation (only select columns we need)
    const conversationMessages = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        role: messages.role,
        content: messages.content,
        toolCalls: messages.toolCalls,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);

    if (conversationMessages.length === 0) {
      return NextResponse.json({ error: 'No messages found in conversation' }, { status: 400 });
    }

    // Calculate metrics
    const toolCallCount = conversationMessages.filter(m => m.toolCalls !== null).length;

    // Prepare evaluation payload
    const evaluationMessages = conversationMessages.map(m => ({
      role: m.role.toLowerCase() as 'user' | 'assistant',
      content: m.content,
      toolCalls: m.toolCalls,
    }));

    // Run deep evaluation using LLM
    const evalResult = await evaluateConversation(
      evaluationMessages,
      conversation.type
    );

    // Store or update evaluation
    const existingEval = await db
      .select()
      .from(conversationEvaluations)
      .where(eq(conversationEvaluations.conversationId, conversationId))
      .limit(1);

    if (existingEval.length > 0) {
      // Update existing
      await db
        .update(conversationEvaluations)
        .set({
          overallScore: evalResult.overallScore,
          clarityScore: evalResult.clarityScore,
          helpfulnessScore: evalResult.helpfulnessScore,
          accuracyScore: evalResult.accuracyScore,
          efficiencyScore: evalResult.efficiencyScore,
          totalMessages: conversationMessages.length,
          toolCallCount,
          evalRawResponse: JSON.stringify(evalResult),
          evaluatedAt: new Date(),
        })
        .where(eq(conversationEvaluations.conversationId, conversationId));
    } else {
      // Create new
      await db.insert(conversationEvaluations).values({
        conversationId,
        overallScore: evalResult.overallScore,
        clarityScore: evalResult.clarityScore,
        helpfulnessScore: evalResult.helpfulnessScore,
        accuracyScore: evalResult.accuracyScore,
        efficiencyScore: evalResult.efficiencyScore,
        totalMessages: conversationMessages.length,
        toolCallCount,
        evalRawResponse: JSON.stringify(evalResult),
        evaluatedAt: new Date(),
      });
    }

    return NextResponse.json({
      success: true,
      evaluation: {
        overallScore: evalResult.overallScore,
        clarityScore: evalResult.clarityScore,
        helpfulnessScore: evalResult.helpfulnessScore,
        accuracyScore: evalResult.accuracyScore,
        efficiencyScore: evalResult.efficiencyScore,
        totalMessages: conversationMessages.length,
        toolCallCount,
        summary: evalResult.summary,
        improvements: evalResult.improvements,
      },
    });
  } catch (error) {
    console.error('Eval trigger error:', error);
    return NextResponse.json({ error: 'Failed to evaluate conversation' }, { status: 500 });
  }
}
