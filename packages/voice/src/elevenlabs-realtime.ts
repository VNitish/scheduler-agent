/**
 * ElevenLabs Conversational AI Client
 * Handles real-time voice conversation directly in the browser
 *
 * Based on ElevenLabs WebSocket API:
 * https://elevenlabs.io/docs/agents-platform/libraries/web-sockets
 */

export interface ElevenLabsRealtimeConfig {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onResponse?: (text: string) => void;
  onAudioResponse?: (text: string) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: 'idle' | 'connecting' | 'connected' | 'speaking' | 'listening') => void;
  onToolCall?: (toolName: string, parameters: any) => Promise<any>;
  onEndConversation?: () => void;
}

export class ElevenLabsRealtimeClient {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying: boolean = false;
  private config: ElevenLabsRealtimeConfig;
  private currentSource: AudioBufferSourceNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorAudioContext: AudioContext | null = null;
  private conversationId: string | null = null;
  private systemPrompt: string | undefined;
  private currentAgentResponse: string = '';

  constructor(config: ElevenLabsRealtimeConfig = {}) {
    this.config = config;
  }

  /**
   * Connect to ElevenLabs Conversational AI
   * @param signedUrl - The signed WebSocket URL from the backend
   * @param systemPrompt - Optional system prompt to override agent behavior
   */
  async connect(signedUrl: string, systemPrompt?: string): Promise<void> {
    this.systemPrompt = systemPrompt;
    try {
      this.config.onStateChange?.('connecting');

      // Initialize audio context for playback
      this.audioContext = new AudioContext();

      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Connect to ElevenLabs WebSocket
      this.ws = new WebSocket(signedUrl);

      this.ws.onopen = () => {
        // Send initial conversation data with PCM output format for better streaming
        // PCM streams cleanly without partial frame issues that MP3 has
        const initData: any = {
          type: 'conversation_initiation_client_data',
          conversation_config_override: {
            agent: {
              tts: {
                output_format: 'pcm_16000', // 16kHz PCM for clean streaming
              },
            },
          },
        };

        // Add system prompt override if provided
        if (this.systemPrompt) {
          initData.conversation_config_override.agent.prompt = {
            prompt: this.systemPrompt,
          };
        }

        this.ws?.send(JSON.stringify(initData));
      };

      this.ws.onmessage = async (event) => {
        await this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('[ElevenLabs] WebSocket error:', error);
        this.config.onError?.(new Error('WebSocket connection failed'));
      };

      this.ws.onclose = (event) => {
        this.config.onStateChange?.('idle');
        this.cleanup();
      };
    } catch (error) {
      this.config.onError?.(error as Error);
      this.disconnect();
      throw error;
    }
  }

  private startAudioCapture(): void {
    if (!this.mediaStream || !this.ws) return;

    // Create audio context for capturing at 16kHz (ElevenLabs requirement)
    this.processorAudioContext = new AudioContext({ sampleRate: 16000 });
    this.sourceNode = this.processorAudioContext.createMediaStreamSource(this.mediaStream);
    this.scriptProcessor = this.processorAudioContext.createScriptProcessor(4096, 1, 1);

    this.sourceNode.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.processorAudioContext.destination);

    this.scriptProcessor.onaudioprocess = (e) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      if (this.isPlaying) return; // Don't send audio while playing response

      const inputData = e.inputBuffer.getChannelData(0);

      // Convert float32 to int16 PCM (16-bit)
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Convert to base64
      const base64Audio = this.arrayBufferToBase64(pcmData.buffer);

      // Send audio chunk to ElevenLabs (correct format per docs)
      this.ws.send(JSON.stringify({
        user_audio_chunk: base64Audio,
      }));
    };

    this.config.onStateChange?.('listening');
  }

  private async handleMessage(data: string | ArrayBuffer | Blob): Promise<void> {
    try {
      // Handle Blob data (convert to string)
      let messageStr: string;
      if (data instanceof Blob) {
        messageStr = await data.text();
      } else if (data instanceof ArrayBuffer) {
        messageStr = new TextDecoder().decode(data);
      } else {
        messageStr = data;
      }

      const message = JSON.parse(messageStr);
      console.log('[ElevenLabs] Received:', message.type);

      switch (message.type) {
        case 'conversation_initiation_metadata':
          // Conversation started - now start audio capture
          this.conversationId = message.conversation_initiation_metadata_event?.conversation_id;
          this.config.onStateChange?.('connected');
          this.startAudioCapture();
          break;

        case 'user_transcript':
          // Flush any unsaved agent response from the previous turn
          if (this.currentAgentResponse) {
            this.config.onAudioResponse?.(this.currentAgentResponse);
            this.currentAgentResponse = '';
          }
          // User's speech transcription
          const userText = message.user_transcription_event?.user_transcript || '';
          if (userText) {
            this.config.onTranscript?.(userText, true);
          }
          break;

        case 'agent_response':
          // Agent's text response — accumulate for onAudioResponse
          const agentText = message.agent_response_event?.agent_response || '';
          if (agentText) {
            this.currentAgentResponse += agentText;
            this.config.onResponse?.(agentText);
          }
          break;

        case 'agent_response_correction':
          // Correction to previous response
          const correctedText = message.agent_response_correction_event?.corrected_agent_response || '';
          if (correctedText) {
            this.config.onResponse?.(correctedText);
          }
          break;

        case 'audio':
          // Audio from the agent (base64 encoded)
          const audioBase64 = message.audio_event?.audio_base_64;
          if (audioBase64) {
            this.config.onStateChange?.('speaking');
            const audioData = this.base64ToArrayBuffer(audioBase64);
            if (audioData.byteLength > 0) {
              this.audioQueue.push(audioData);
              this.playNextAudio();
            }
          }
          break;

        case 'ping':
          // Respond to ping with pong (include event_id)
          const eventId = message.ping_event?.event_id;
          this.ws?.send(JSON.stringify({
            type: 'pong',
            event_id: eventId,
          }));
          break;

        case 'interruption':
          // User interrupted the agent
          this.stopPlayback();
          this.config.onStateChange?.('listening');
          break;

        case 'client_tool_call':
          // Agent wants to execute a tool
          await this.handleToolCall(message);
          break;

        case 'internal_tentative_agent_response':
          // Tentative response (can be ignored or used for early display)
          break;

        case 'internal_turn_probability':
          // Turn probability (can be ignored)
          break;

        case 'internal_vad_score':
          // VAD score (can be ignored)
          break;

        case 'error':
          console.error('[ElevenLabs] Error:', message);
          this.config.onError?.(new Error(message.error || 'Unknown error'));
          break;

        default:
          // Unhandled message type
          break;
      }
    } catch (error) {
      console.error('[ElevenLabs] Error handling message:', error);
    }
  }

  private async handleToolCall(message: any): Promise<void> {
    const toolCall = message.client_tool_call;
    if (!toolCall) return;

    const { tool_call_id, tool_name, parameters } = toolCall;

    // Handle end_conversation locally
    if (tool_name === 'end_conversation') {
      this.ws?.send(JSON.stringify({
        type: 'client_tool_result',
        tool_call_id,
        result: JSON.stringify({ result: 'Ending conversation. Goodbye!' }),
        is_error: false,
      }));

      // Disconnect after a brief delay to allow goodbye message
      setTimeout(() => {
        this.config.onEndConversation?.();
        this.disconnect();
      }, 2000);
      return;
    }

    try {
      let result: any;

      if (this.config.onToolCall) {
        result = await this.config.onToolCall(tool_name, parameters);
      } else {
        // Default: call our backend API
        const response = await fetch('/api/voice/tools', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
          body: JSON.stringify({
            tool_name,
            parameters,
            caller_id: 'browser',
          }),
        });
        result = await response.json();
      }

      // Send tool result back to ElevenLabs
      this.ws?.send(JSON.stringify({
        type: 'client_tool_result',
        tool_call_id,
        result: typeof result === 'string' ? result : JSON.stringify(result),
        is_error: false,
      }));
    } catch (error) {
      console.error('[ElevenLabs] Tool call error:', error);
      this.ws?.send(JSON.stringify({
        type: 'client_tool_result',
        tool_call_id,
        result: 'Tool execution failed',
        is_error: true,
      }));
    }
  }

  private async playNextAudio(): Promise<void> {
    if (this.isPlaying || this.audioQueue.length === 0 || !this.audioContext) {
      if (this.audioQueue.length === 0 && !this.isPlaying) {
        // Audio turn finished — fire onAudioResponse with the full accumulated text
        if (this.currentAgentResponse) {
          this.config.onAudioResponse?.(this.currentAgentResponse);
          this.currentAgentResponse = '';
        }
        this.config.onStateChange?.('listening');
      }
      return;
    }

    this.isPlaying = true;
    const audioData = this.audioQueue.shift()!;

    try {
      // Resume audio context if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // We requested PCM 16kHz format - decode as 16-bit signed PCM
      // PCM streams cleanly without the partial frame issues that MP3 has
      const audioBuffer = this.pcmToAudioBuffer(audioData, 16000);

      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = audioBuffer;
      this.currentSource.connect(this.audioContext.destination);

      this.currentSource.onended = () => {
        this.isPlaying = false;
        this.currentSource = null;
        this.playNextAudio();
      };

      this.currentSource.start();
    } catch (error) {
      console.error('[ElevenLabs] Error playing audio:', error);
      this.isPlaying = false;
      this.playNextAudio();
    }
  }

  private pcmToAudioBuffer(pcmData: ArrayBuffer, sampleRate: number): AudioBuffer {
    const int16Array = new Int16Array(pcmData);
    const float32Array = new Float32Array(int16Array.length);

    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768;
    }

    const audioBuffer = this.audioContext!.createBuffer(1, float32Array.length, sampleRate);
    audioBuffer.copyToChannel(float32Array, 0);
    return audioBuffer;
  }

  private stopPlayback(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      this.currentSource = null;
    }
    this.audioQueue = [];
    this.isPlaying = false;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    try {
      // Handle potential whitespace or newlines in base64
      const cleanBase64 = base64.replace(/\s/g, '');
      const binary = atob(cleanBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    } catch (e) {
      console.error('[ElevenLabs] Failed to decode base64:', e);
      return new ArrayBuffer(0);
    }
  }

  private cleanup(): void {
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.processorAudioContext) {
      this.processorAudioContext.close().catch(() => {});
      this.processorAudioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.stopPlayback();
  }

  /**
   * Disconnect from ElevenLabs
   */
  disconnect(): void {
    // Flush any unsaved agent response before disconnecting
    if (this.currentAgentResponse) {
      this.config.onAudioResponse?.(this.currentAgentResponse);
      this.currentAgentResponse = '';
    }

    this.config.onStateChange?.('idle');

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.cleanup();
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Send contextual update (non-interrupting information)
   */
  sendContextualUpdate(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({
      type: 'contextual_update',
      text,
    }));
  }

  /**
   * Mute/unmute microphone
   */
  setMuted(muted: boolean): void {
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
    }
  }
}
