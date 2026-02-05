import { OpenAIRealtimeClient, ElevenLabsRealtimeClient } from '@repo/voice';
import { VoiceState, ToolCall } from './types';
import { handleApiError, safeFetch } from './error-handling';

export interface VoiceSessionRefs {
  realtimeClientRef: React.MutableRefObject<OpenAIRealtimeClient | null>;
  elevenLabsClientRef: React.MutableRefObject<ElevenLabsRealtimeClient | null>;
  pendingToolCallsRef: React.MutableRefObject<ToolCall[]>;
  voiceStartTimeRef: React.MutableRefObject<number | null>;
}

export interface VoiceHandlers {
  startOpenAIVoice: () => Promise<void>;
  startElevenLabsCall: () => Promise<void>;
  endVoiceSession: () => void;
}

export const createVoiceHandlers = (
  setVoiceState: React.Dispatch<React.SetStateAction<VoiceState>>,
  setVoiceTranscript: React.Dispatch<React.SetStateAction<string>>,
  setVoiceResponse: React.Dispatch<React.SetStateAction<string>>,
  setShowVoiceModal: React.Dispatch<React.SetStateAction<boolean>>,
  setVoiceMode: React.Dispatch<React.SetStateAction<'openai' | 'elevenlabs' | null>>,
  setVoiceConversationId: React.Dispatch<React.SetStateAction<string | null>>,
  refs: VoiceSessionRefs,
  storeVoiceMessage: (convId: string, role: 'USER' | 'ASSISTANT', content: string, toolCalls?: ToolCall[] | null) => Promise<void>,
  endConversation: (convId: string, duration?: number) => Promise<void>,
  voiceConversationId: string | null // Add the voiceConversationId as a parameter
): VoiceHandlers => {
  const { realtimeClientRef, elevenLabsClientRef, pendingToolCallsRef, voiceStartTimeRef } = refs;

  const startOpenAIVoice = async () => {
    try {
      setVoiceMode('openai');
      setShowVoiceModal(true);
      setVoiceState('connecting');
      setVoiceTranscript('');
      setVoiceResponse('');
      voiceStartTimeRef.current = Date.now(); // Track voice session start time

      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) {
        throw new Error('No access token available');
      }

      const response = await safeFetch('/api/voice/openai-session', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }, 'START_OPENAI_VOICE');

      const { client_secret, conversation_id } = await response.json();
      setVoiceConversationId(conversation_id);

      // Reset pending tool calls
      pendingToolCallsRef.current = [];

      realtimeClientRef.current = new OpenAIRealtimeClient({
        onStateChange: setVoiceState,
        onTranscript: (text) => {
          setVoiceTranscript(text);
          storeVoiceMessage(conversation_id, 'USER', text);
        },
        onResponse: (text) => {
          setVoiceResponse((prev) => prev + text);
        },
        onResponseComplete: (text) => {
          setVoiceResponse(text);
          const tools = pendingToolCallsRef.current.length > 0 ? [...pendingToolCallsRef.current] : null;
          pendingToolCallsRef.current = [];
          storeVoiceMessage(conversation_id, 'ASSISTANT', text, tools);
        },
        onToolCall: async (toolName, parameters) => {
          try {
            const accessToken = localStorage.getItem('access_token');
            if (!accessToken) {
              throw new Error('No access token available for tool call');
            }

            const res = await safeFetch('/api/voice/tools', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                tool_name: toolName,
                parameters,
                caller_id: 'browser',
                conversationId: conversation_id,
                voiceType: 'OPENAI_VOICE',
              }),
            }, 'VOICE_TOOL_CALL');

            const result = await res.json();
            pendingToolCallsRef.current.push({ name: toolName, arguments: parameters, result: result.result });
            return result;
          } catch (toolError) {
            console.error('Tool call error:', toolError);
            return { error: 'Tool call failed' };
          }
        },
        onError: (error) => {
          console.error('Voice error:', error);
          setVoiceState('idle');
        },
        onEndConversation: () => {
          endVoiceSession();
        },
      });

      await realtimeClientRef.current.connect(client_secret);
    } catch (error) {
      const handledError = handleApiError(error, 'START_OPENAI_VOICE');
      console.error('Failed to start OpenAI voice:', handledError);
      setVoiceState('idle');
      setShowVoiceModal(false);
    }
  };

  const startElevenLabsCall = async () => {
    try {
      setVoiceMode('elevenlabs');
      setShowVoiceModal(true);
      setVoiceState('connecting');
      setVoiceTranscript('');
      setVoiceResponse('');
      voiceStartTimeRef.current = Date.now(); // Track voice session start time

      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) {
        throw new Error('No access token available');
      }

      const response = await safeFetch('/api/voice/elevenlabs-session', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }, 'START_ELEVENLABS_VOICE');

      const { signed_url, system_prompt, conversation_id } = await response.json();
      setVoiceConversationId(conversation_id);

      // Reset pending tool calls
      pendingToolCallsRef.current = [];

      elevenLabsClientRef.current = new ElevenLabsRealtimeClient({
        onStateChange: setVoiceState,
        onTranscript: (text) => {
          setVoiceTranscript(text);
          storeVoiceMessage(conversation_id, 'USER', text);
        },
        onResponse: (text) => setVoiceResponse((prev) => prev + text),
        onAudioResponse: (text) => {
          setVoiceResponse(text);
          const tools = pendingToolCallsRef.current.length > 0 ? [...pendingToolCallsRef.current] : null;
          pendingToolCallsRef.current = [];
          storeVoiceMessage(conversation_id, 'ASSISTANT', text, tools);
        },
        onToolCall: async (toolName, parameters) => {
          try {
            const accessToken = localStorage.getItem('access_token');
            if (!accessToken) {
              throw new Error('No access token available for tool call');
            }

            const res = await safeFetch('/api/voice/tools', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                tool_name: toolName,
                parameters,
                caller_id: 'browser',
                conversationId: conversation_id,
                voiceType: 'ELEVENLABS_VOICE',
              }),
            }, 'ELEVENLABS_TOOL_CALL');

            const result = await res.json();
            pendingToolCallsRef.current.push({ name: toolName, arguments: parameters, result: result.result });
            return result;
          } catch (toolError) {
            console.error('Tool call error:', toolError);
            return { error: 'Tool call failed' };
          }
        },
        onError: (error) => {
          console.error('ElevenLabs voice error:', error);
          setVoiceState('idle');
        },
        onEndConversation: () => {
          endVoiceSession();
        },
      });

      // Pass the system prompt with user context to ElevenLabs
      await elevenLabsClientRef.current.connect(signed_url, system_prompt);
    } catch (error) {
      const handledError = handleApiError(error, 'START_ELEVENLABS_VOICE');
      console.error('Failed to start ElevenLabs voice:', handledError);
      setVoiceState('idle');
      setShowVoiceModal(false);
      setVoiceMode(null);
    }
  };

  const endVoiceSession = () => {
    // Calculate voice session duration and mark conversation as completed
    if (refs.voiceStartTimeRef.current) {
      const duration = Math.floor((Date.now() - refs.voiceStartTimeRef.current) / 1000);
      // Use the voiceConversationId from the closure
      if (voiceConversationId) {
        endConversation(voiceConversationId, duration);
      }
    }

    refs.voiceStartTimeRef.current = null;
    refs.pendingToolCallsRef.current = [];

    if (realtimeClientRef.current) {
      try {
        realtimeClientRef.current.disconnect();
      } catch (e) {
        console.error('Error disconnecting OpenAI client:', e);
      }
      realtimeClientRef.current = null;
    }
    if (elevenLabsClientRef.current) {
      try {
        elevenLabsClientRef.current.disconnect();
      } catch (e) {
        console.error('Error disconnecting ElevenLabs client:', e);
      }
      elevenLabsClientRef.current = null;
    }
    setVoiceState('idle');
    setShowVoiceModal(false);
    setVoiceMode(null);
    setVoiceTranscript('');
    setVoiceResponse('');
  };

  return {
    startOpenAIVoice,
    startElevenLabsCall,
    endVoiceSession
  };
};