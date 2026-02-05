/**
 * OpenAI Realtime API Client
 * Handles real-time voice conversation with GPT-4o
 */

import { SYSTEM_PROMPTS } from '@repo/ai-agent/src/prompts';

export interface RealtimeConfig {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onResponse?: (text: string) => void;
  onResponseComplete?: (text: string) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: 'idle' | 'connecting' | 'connected' | 'speaking' | 'listening') => void;
  onToolCall?: (toolName: string, parameters: any) => Promise<any>;
  onEndConversation?: () => void;
}

export class OpenAIRealtimeClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private mediaStream: MediaStream | null = null;
  private config: RealtimeConfig;
  private sessionConfig: any = null;
  private currentResponseText: string = '';

  constructor(config: RealtimeConfig = {}) {
    this.config = config;
  }

  /**
   * Initialize and connect to OpenAI Realtime API
   */
  async connect(sessionToken: string, systemPrompt?: string): Promise<void> {
    try {
      this.config.onStateChange?.('connecting');

      // Create peer connection
      this.pc = new RTCPeerConnection();

      // Set up audio playback
      this.audioElement = document.createElement('audio');
      this.audioElement.autoplay = true;

      this.pc.ontrack = (event) => {
        this.audioElement!.srcObject = event.streams[0];
        this.config.onStateChange?.('connected');
      };

      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaStream.getTracks().forEach(track => {
        this.pc!.addTrack(track, this.mediaStream!);
      });

      // Set up data channel for events
      this.dc = this.pc.createDataChannel('oai-events');
      this.setupDataChannel(systemPrompt);

      // Create and set local description
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Connect to OpenAI
      const response = await fetch(
        'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp,
        }
      );

      if (!response.ok) {
        throw new Error('Failed to connect to OpenAI Realtime');
      }

      const answerSdp = await response.text();
      await this.pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      this.config.onStateChange?.('listening');
    } catch (error) {
      this.config.onError?.(error as Error);
      this.disconnect();
      throw error;
    }
  }

  private setupDataChannel(systemPrompt?: string): void {
    if (!this.dc) return;

    this.dc.onopen = () => {
      // Configure the session with tools for scheduling
      const sessionUpdate = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: systemPrompt || this.getDefaultSystemPrompt(),
          voice: 'alloy',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'whisper-1',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
          tools: [
            {
              type: 'function',
              name: 'check_availability',
              description: 'Check calendar for available meeting slots',
              parameters: {
                type: 'object',
                properties: {
                  duration: {
                    type: 'number',
                    description: 'Meeting duration in minutes (default 30)',
                  },
                  date: {
                    type: 'string',
                    description: 'Date to check (ISO format or natural language like "tomorrow")',
                  },
                  time_preference: {
                    type: 'string',
                    enum: ['morning', 'afternoon', 'evening', 'any'],
                  },
                },
                required: ['duration'],
              },
            },
            {
              type: 'function',
              name: 'schedule_meeting',
              description: 'Create a NEW meeting on the calendar. Use update_meeting to modify existing meetings.',
              parameters: {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                    description: 'Meeting title',
                  },
                  start_time: {
                    type: 'string',
                    description: 'Meeting start time (ISO format)',
                  },
                  duration: {
                    type: 'number',
                    description: 'Duration in minutes',
                  },
                  attendees: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Email addresses of attendees',
                  },
                },
                required: ['title', 'start_time', 'duration'],
              },
            },
            {
              type: 'function',
              name: 'update_meeting',
              description: 'Update an EXISTING meeting (change title, time, or duration). First use get_meetings to find the meeting ID.',
              parameters: {
                type: 'object',
                properties: {
                  meeting_id: {
                    type: 'string',
                    description: 'The Google Calendar event ID of the meeting to update',
                  },
                  title: {
                    type: 'string',
                    description: 'New meeting title (optional)',
                  },
                  start_time: {
                    type: 'string',
                    description: 'New start time in ISO format (optional)',
                  },
                  duration: {
                    type: 'number',
                    description: 'New duration in minutes (optional)',
                  },
                },
                required: ['meeting_id'],
              },
            },
            {
              type: 'function',
              name: 'delete_meeting',
              description: 'Delete/cancel a meeting from the calendar. First use get_meetings to find the meeting ID.',
              parameters: {
                type: 'object',
                properties: {
                  meeting_id: {
                    type: 'string',
                    description: 'The Google Calendar event ID of the meeting to delete',
                  },
                },
                required: ['meeting_id'],
              },
            },
            {
              type: 'function',
              name: 'get_meetings',
              description: 'Get a list of meetings. Use this to find meeting IDs before updating or deleting.',
              parameters: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'Search query to filter meetings by title (optional)',
                  },
                  date: {
                    type: 'string',
                    description: 'Date to search (ISO format or "today", "tomorrow")',
                  },
                },
                required: [],
              },
            },
            {
              type: 'function',
              name: 'get_todays_meetings',
              description: 'Get all meetings scheduled for today.',
              parameters: {
                type: 'object',
                properties: {},
                required: [],
              },
            },
            {
              type: 'function',
              name: 'add_contact',
              description: 'Add a new contact to the user\'s contact list.',
              parameters: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'The contact\'s full name',
                  },
                  email: {
                    type: 'string',
                    description: 'The contact\'s email address (optional)',
                  },
                  nickname: {
                    type: 'string',
                    description: 'A nickname or alias for the contact (optional)',
                  },
                  relation: {
                    type: 'string',
                    description: 'Relationship type: colleague, manager, client, friend, family (optional)',
                  },
                },
                required: ['name'],
              },
            },
            {
              type: 'function',
              name: 'update_contact',
              description: 'Update an existing contact\'s information (name, email, nickname, or relation).',
              parameters: {
                type: 'object',
                properties: {
                  contact_id: {
                    type: 'string',
                    description: 'The contact ID to update (use get_contacts to find it)',
                  },
                  search_name: {
                    type: 'string',
                    description: 'Search for contact by name if ID is not known',
                  },
                  name: {
                    type: 'string',
                    description: 'New name for the contact (optional)',
                  },
                  email: {
                    type: 'string',
                    description: 'New email for the contact (optional)',
                  },
                  nickname: {
                    type: 'string',
                    description: 'Add a new nickname for the contact (optional)',
                  },
                  relation: {
                    type: 'string',
                    description: 'Update relationship type (optional)',
                  },
                },
                required: [],
              },
            },
            {
              type: 'function',
              name: 'get_contacts',
              description: 'Search or list user\'s contacts. Use this to find contact information before scheduling meetings with them.',
              parameters: {
                type: 'object',
                properties: {
                  search: {
                    type: 'string',
                    description: 'Search query to filter contacts by name, nickname, or email (optional)',
                  },
                },
                required: [],
              },
            },
            {
              type: 'function',
              name: 'end_conversation',
              description: 'End the voice conversation when the user says goodbye, bye, end call, hang up, or similar.',
              parameters: {
                type: 'object',
                properties: {},
                required: [],
              },
            },
          ],
        },
      };

      this.dc!.send(JSON.stringify(sessionUpdate));
    };

    this.dc.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'conversation.item.input_audio_transcription.completed':
            if (data.transcript) {
              this.config.onTranscript?.(data.transcript, true);
            }
            break;

          case 'response.audio_transcript.delta':
            this.currentResponseText += data.delta;
            this.config.onResponse?.(data.delta);
            break;

          case 'response.audio_transcript.done':
            if (data.transcript) {
              this.config.onResponseComplete?.(data.transcript);
            }
            this.currentResponseText = '';
            break;

          case 'response.function_call_arguments.done':
            await this.handleToolCall(data);
            break;

          case 'input_audio_buffer.speech_started':
            this.config.onStateChange?.('listening');
            break;

          case 'response.audio.started':
            this.config.onStateChange?.('speaking');
            break;

          case 'response.done':
            // Fallback: if response.audio_transcript.done didn't fire,
            // use the accumulated text from delta events
            if (this.currentResponseText) {
              this.config.onResponseComplete?.(this.currentResponseText);
              this.currentResponseText = '';
            }
            this.config.onStateChange?.('listening');
            break;

          case 'error':
            this.config.onError?.(new Error(data.error?.message || 'Unknown error'));
            break;
        }
      } catch (error) {
        console.error('[OpenAI] Error handling message:', error);
      }
    };
  }

  private async handleToolCall(data: any): Promise<void> {
    const { call_id, name, arguments: args } = data;
    const parsedArgs = JSON.parse(args);

    // Handle end_conversation locally
    if (name === 'end_conversation') {
      const toolResponse = {
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id,
          output: JSON.stringify({ result: 'Ending conversation. Goodbye!' }),
        },
      };
      this.dc?.send(JSON.stringify(toolResponse));
      this.dc?.send(JSON.stringify({ type: 'response.create' }));

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
        result = await this.config.onToolCall(name, parsedArgs);
      } else {
        // Default: call our backend API
        const response = await fetch('/api/voice/tools', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
          body: JSON.stringify({
            tool_name: name,
            parameters: parsedArgs,
            caller_id: 'browser',
          }),
        });
        result = await response.json();
      }

      // Send result back to OpenAI
      const toolResponse = {
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id,
          output: JSON.stringify(result),
        },
      };

      this.dc?.send(JSON.stringify(toolResponse));

      // Trigger response generation
      this.dc?.send(JSON.stringify({ type: 'response.create' }));
    } catch (error) {
      console.error('Tool call error:', error);
    }
  }

  private getDefaultSystemPrompt(): string {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Use the centralized prompt and replace the date placeholder
    return SYSTEM_PROMPTS.OPENAI_REALTIME_VOICE_AGENT.replace('{{DATE}}', today);
  }

  /**
   * Disconnect from OpenAI Realtime
   */
  disconnect(): void {
    // Flush any unsaved response text before disconnecting
    if (this.currentResponseText) {
      this.config.onResponseComplete?.(this.currentResponseText);
      this.currentResponseText = '';
    }

    this.config.onStateChange?.('idle');

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    if (this.audioElement) {
      this.audioElement.srcObject = null;
      this.audioElement = null;
    }
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.pc?.connectionState === 'connected';
  }

  /**
   * Send a text message (for testing without voice)
   */
  sendText(text: string): void {
    if (!this.dc || this.dc.readyState !== 'open') return;

    const message = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    };

    this.dc.send(JSON.stringify(message));
    this.dc.send(JSON.stringify({ type: 'response.create' }));
  }
}
