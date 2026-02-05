import OpenAI from 'openai';

export interface EvalResult {
  overallScore: number;
  clarityScore: number;
  helpfulnessScore: number;
  accuracyScore: number;
  efficiencyScore: number;
  summary: string;
  improvements: string[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: any;
}

/**
 * Evaluate a conversation using GPT-4o
 */
export async function evaluateConversation(
  messages: Message[],
  conversationType: 'TEXT' | 'OPENAI_VOICE' | 'ELEVENLABS_VOICE'
): Promise<EvalResult> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Count tool calls
  const toolCallCount = messages.filter(m => m.toolCalls).length;

  // Format messages for evaluation
  const formattedMessages = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const evalPrompt = `You are an expert evaluator for AI scheduling assistants. Your task is to evaluate the quality of a conversation between a user and a scheduling assistant.

## Conversation Type
${conversationType === 'TEXT' ? 'Text Chat' : conversationType === 'OPENAI_VOICE' ? 'OpenAI Voice' : 'ElevenLabs Voice'}

## Metrics
- Total messages: ${messages.length}
- Tool calls made: ${toolCallCount}

## Conversation
${formattedMessages}

## Evaluation Criteria
Rate each criterion on a scale of 0-100:

1. **CLARITY** (0-100): How clear and understandable were the assistant's responses?
   - Were responses easy to understand?
   - Was the language appropriate for the medium (concise for voice, can be more detailed for text)?
   - Were there any confusing or ambiguous statements?

2. **HELPFULNESS** (0-100): Did the assistant help the user accomplish their scheduling task?
   - Did the assistant understand the user's intent?
   - Were appropriate actions taken (scheduling, checking availability, etc.)?
   - Did the conversation reach a satisfactory conclusion?

3. **ACCURACY** (0-100): Were dates, times, and meeting details handled correctly?
   - Were times and dates parsed correctly?
   - Were there any errors in understanding or presenting schedule information?
   - Were all details captured accurately?

4. **EFFICIENCY** (0-100): Was the task completed in a reasonable number of turns?
   - Was there unnecessary back-and-forth?
   - Could the assistant have been more proactive?
   - Was the conversation flow natural and efficient?

## Response Format
Respond with a JSON object in this exact format:
{
  "clarityScore": <number 0-100>,
  "helpfulnessScore": <number 0-100>,
  "accuracyScore": <number 0-100>,
  "efficiencyScore": <number 0-100>,
  "overallScore": <weighted average of all scores>,
  "summary": "<2-3 sentence summary of the conversation quality>",
  "improvements": ["<specific improvement suggestion 1>", "<specific improvement suggestion 2>"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: evalPrompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Lower temperature for more consistent evaluations
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from evaluation model');
    }

    const result = JSON.parse(content) as EvalResult;

    // Validate and normalize scores
    const normalizeScore = (score: number) => Math.max(0, Math.min(100, Math.round(score)));

    return {
      clarityScore: normalizeScore(result.clarityScore),
      helpfulnessScore: normalizeScore(result.helpfulnessScore),
      accuracyScore: normalizeScore(result.accuracyScore),
      efficiencyScore: normalizeScore(result.efficiencyScore),
      overallScore: normalizeScore(result.overallScore ||
        (result.clarityScore + result.helpfulnessScore + result.accuracyScore + result.efficiencyScore) / 4
      ),
      summary: result.summary || 'Evaluation completed.',
      improvements: result.improvements || [],
    };
  } catch (error) {
    console.error('Evaluation error:', error);

    // Return a default evaluation on error
    return {
      clarityScore: 0,
      helpfulnessScore: 0,
      accuracyScore: 0,
      efficiencyScore: 0,
      overallScore: 0,
      summary: 'Evaluation failed due to an error.',
      improvements: ['Unable to evaluate - please try again'],
    };
  }
}
