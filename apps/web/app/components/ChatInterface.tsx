import { useRef, KeyboardEvent } from 'react';
import { Button } from '@repo/ui';

import {
  MessageIcon,
  PlusIcon,
  SendIcon,
  MicIcon,
  PhoneIcon,
  RobotIcon,
} from '../components/icons';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isLoading: boolean;
  message: string;
  setMessage: (message: string) => void;
  handleSendMessage: () => void;
  startNewChat: () => void;
  startOpenAIVoice: () => void;
  startElevenLabsCall: () => void;
  userImage?: string;
}

export const ChatInterface = ({
  messages,
  isLoading,
  message,
  setMessage,
  handleSendMessage,
  startNewChat,
  startOpenAIVoice,
  startElevenLabsCall,
  userImage,
}: ChatInterfaceProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Get user name from localStorage
  const getUserFirstName = () => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          return user.name?.split(' ')[0] || '';
        } catch (e) {
          return '';
        }
      }
    }
    return '';
  };

  return (
    <div className="w-3/5 border-r border-border flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-medium flex items-center gap-2">
          <MessageIcon className="w-5 h-5" />
          Chat Assistant
        </h2>
        <Button
          variant="bordered"
          size="sm"
          onClick={startNewChat}
          title="Start new chat (evaluates current session)"
        >
          <PlusIcon className="w-4 h-4 mr-1" />
          New Chat
        </Button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
        {/* Initial greeting */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 flex-shrink-0 bg-muted flex items-center justify-center">
            <RobotIcon className="w-5 h-5" />
          </div>
          <div className="border border-border p-4 max-w-md">
            <p className="text-sm">
              Hi {getUserFirstName()}, I'm your AI scheduling assistant. How can I help you today?
            </p>
          </div>
        </div>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-3 ${
              msg.role === 'user' ? 'flex-row-reverse' : ''
            }`}
          >
            {msg.role === 'assistant' ? (
              <div className="w-8 h-8 flex-shrink-0 bg-muted flex items-center justify-center">
                <RobotIcon className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-8 h-8 flex-shrink-0">
                {userImage ? (
                  <img src={userImage} alt="You" className="w-8 h-8 object-cover" />
                ) : (
                  <div className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">
                    {getUserFirstName()?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
              </div>
            )}
            <div
              className={`p-4 max-w-md ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 flex-shrink-0 bg-muted flex items-center justify-center">
              <RobotIcon className="w-5 h-5" />
            </div>
            <div className="border border-border p-4 max-w-md">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-foreground animate-pulse" />
                <div className="w-2 h-2 bg-foreground animate-pulse delay-75" />
                <div className="w-2 h-2 bg-foreground animate-pulse delay-150" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Type your message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-input bg-background text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          />
          <Button onClick={handleSendMessage} disabled={isLoading || !message.trim()}>
            <SendIcon className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={startOpenAIVoice}
            title="OpenAI Voice Chat"
          >
            <MicIcon className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={startElevenLabsCall}
            title="ElevenLabs Voice Chat"
          >
            <PhoneIcon className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MicIcon className="w-3 h-3" /> OpenAI Voice
          </span>
          <span className="flex items-center gap-1">
            <PhoneIcon className="w-3 h-3" /> ElevenLabs Voice
          </span>
        </div>
      </div>
    </div>
  );
};