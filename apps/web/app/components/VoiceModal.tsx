import { Button } from '@repo/ui';
import { VoiceState } from '../utils/types';

import {
  XIcon,
  MicIcon,
  PhoneIcon,
  MicOffIcon,
} from '../components/icons';

interface VoiceModalProps {
  showVoiceModal: boolean;
  voiceMode: 'openai' | 'elevenlabs' | null;
  voiceState: VoiceState;
  voiceTranscript: string;
  voiceResponse: string;
  endVoiceSession: () => void;
}

export const VoiceModal = ({
  showVoiceModal,
  voiceMode,
  voiceState,
  voiceTranscript,
  voiceResponse,
  endVoiceSession,
}: VoiceModalProps) => {
  if (!showVoiceModal) return null;

  const isListening = voiceState === 'listening';
  const isSpeaking = voiceState === 'speaking';
  const isConnecting = voiceState === 'connecting';
  const isIdle = voiceState === 'idle';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border p-8 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold">
            {voiceMode === 'openai' ? 'OpenAI Voice' : 'ElevenLabs Voice'}
          </h3>
          <Button variant="bordered" size="icon" onClick={endVoiceSession}>
            <XIcon className="w-5 h-5" />
          </Button>
        </div>

        {voiceMode === 'openai' ? (
          <div className="text-center">
            <div className="mb-6">
              <div
                className={`w-24 h-24 mx-auto border border-border flex items-center justify-center transition-all duration-200 ${
                  isListening
                    ? 'bg-secondary'
                    : isSpeaking
                    ? 'bg-muted'
                    : ''
                }`}
              >
                {isListening ? (
                  <MicIcon className="w-12 h-12" />
                ) : isSpeaking ? (
                  <PhoneIcon className="w-12 h-12" />
                ) : isConnecting ? (
                  <div className="w-8 h-8 border-2 border-foreground border-t-transparent animate-spin" />
                ) : (
                  <MicOffIcon className="w-12 h-12 text-muted-foreground" />
                )}
              </div>
              <p className="mt-3 text-sm font-medium capitalize">
                {isIdle ? 'Ready' : voiceState}
              </p>
            </div>

            {voiceTranscript && (
              <div className="mb-4 p-4 border border-border text-left">
                <p className="text-xs text-muted-foreground mb-1">You said:</p>
                <p className="text-sm">{voiceTranscript}</p>
              </div>
            )}

            {voiceResponse && (
              <div className="mb-4 p-4 bg-secondary text-left">
                <p className="text-xs text-muted-foreground mb-1">Assistant:</p>
                <p className="text-sm">{voiceResponse}</p>
              </div>
            )}

            <Button
              variant="destructive"
              onClick={endVoiceSession}
              className="w-full mt-4"
            >
              End Voice Chat
            </Button>
          </div>
        ) : (
          <div className="text-center">
            <div className="mb-6">
              <div
                className={`w-24 h-24 mx-auto border border-border flex items-center justify-center transition-all duration-200 ${
                  isListening
                    ? 'bg-secondary'
                    : isSpeaking
                    ? 'bg-muted'
                    : ''
                }`}
              >
                {isListening ? (
                  <MicIcon className="w-12 h-12" />
                ) : isSpeaking ? (
                  <PhoneIcon className="w-12 h-12" />
                ) : isConnecting ? (
                  <div className="w-8 h-8 border-2 border-foreground border-t-transparent animate-spin" />
                ) : (
                  <MicOffIcon className="w-12 h-12 text-muted-foreground" />
                )}
              </div>
              <p className="mt-3 text-sm font-medium capitalize">
                {isIdle ? 'Ready' : voiceState}
              </p>
              <p className="text-xs text-muted-foreground mt-1">ElevenLabs Voice</p>
            </div>

            {voiceTranscript && (
              <div className="mb-4 p-4 border border-border text-left">
                <p className="text-xs text-muted-foreground mb-1">You said:</p>
                <p className="text-sm">{voiceTranscript}</p>
              </div>
            )}

            {voiceResponse && (
              <div className="mb-4 p-4 bg-secondary text-left">
                <p className="text-xs text-muted-foreground mb-1">Assistant:</p>
                <p className="text-sm">{voiceResponse}</p>
              </div>
            )}

            <Button
              variant="destructive"
              onClick={endVoiceSession}
              className="w-full mt-4"
            >
              End Voice Chat
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};