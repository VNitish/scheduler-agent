'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser, useCalendarAuth, useTokenSync } from '@repo/auth';
import { OpenAIRealtimeClient, ElevenLabsRealtimeClient } from '@repo/voice';
import { Header } from '../components/Header';
import { ChatInterface } from '../components/ChatInterface';
import { CalendarView } from '../components/CalendarView';
import { VoiceModal } from '../components/VoiceModal';
import { createVoiceHandlers, VoiceSessionRefs } from '../utils/voice-handlers';
import { CalendarEvent, VoiceState } from '../utils/types';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const { connectCalendar, loading: calendarLoading } = useCalendarAuth();

  // Automatically sync tokens every 5 minutes to keep them fresh
  useTokenSync();

  // Calendar events state
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Voice state
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceResponse, setVoiceResponse] = useState('');
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceMode, setVoiceMode] = useState<'openai' | 'elevenlabs' | null>(null);
  const [voiceConversationId, setVoiceConversationId] = useState<string | null>(null);
  
  // Create refs
  const realtimeClientRef = useRef<OpenAIRealtimeClient | null>(null);
  const elevenLabsClientRef = useRef<ElevenLabsRealtimeClient | null>(null);
  const pendingToolCallsRef = useRef<Array<{ name: string; arguments: Record<string, any>; result?: any }>>([]);
  const voiceStartTimeRef = useRef<number | null>(null); // Fixed: Added missing ref

  // Create voice handlers
  const voiceSessionRefs: VoiceSessionRefs = {
    realtimeClientRef,
    elevenLabsClientRef,
    pendingToolCallsRef,
    voiceStartTimeRef,
  };

  const storeVoiceMessage = async (
    convId: string,
    role: 'USER' | 'ASSISTANT',
    content: string,
    toolCalls?: Array<{ name: string; arguments: Record<string, any>; result?: any }> | null,
  ) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      console.error('[Voice] ❌ No access token, skipping message storage');
      return;
    }
    if (!content || !content.trim()) {
      return;
    }
    try {
      const res = await fetch('/api/voice/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          conversationId: convId,
          role,
          content: content.trim(),
          toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error(`[Voice] Failed to store message:`, res.status, err);
      }
    } catch (error) {
      console.error('[Voice] Failed to store message:', error);
    }
  };

  const endConversation = async (convId: string, duration?: number) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken || !convId) return;
    try {
      await fetch('/api/conversation/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ conversationId: convId, duration }),
      });
    } catch (error) {
      console.error('Failed to end conversation:', error);
    }
  };

  const { startOpenAIVoice, startElevenLabsCall, endVoiceSession } = createVoiceHandlers(
    setVoiceState,
    setVoiceTranscript,
    setVoiceResponse,
    setShowVoiceModal,
    setVoiceMode,
    setVoiceConversationId,
    voiceSessionRefs,
    storeVoiceMessage,
    endConversation,
    voiceConversationId
  );

  const fetchEvents = useCallback(async () => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return;

    setEventsLoading(true);
    try {
      const response = await fetch('/api/calendar/events?days=2', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setEvents(data.events || []);
      }
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  // Fetch conversation history from database
  const fetchConversationHistory = useCallback(async (convId: string) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return;

    try {
      const response = await fetch(`/api/chat/history?conversationId=${convId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        setConversationId(convId);
      } else {
        // Conversation not found or unauthorized, clear localStorage
        localStorage.removeItem('current_conversation_id');
      }
    } catch (error) {
      console.error('Failed to fetch conversation history:', error);
      localStorage.removeItem('current_conversation_id');
    }
  }, []);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      router.push('/login');
      return;
    }
    const userData = JSON.parse(userStr);
    setUser(userData);

    // Fetch events if calendar is connected
    if (userData.calendarConnected) {
      fetchEvents();
    }

    // Restore conversation from localStorage if exists
    const savedConvId = localStorage.getItem('current_conversation_id');
    if (savedConvId) {
      fetchConversationHistory(savedConvId);
    }
  }, [router, fetchEvents, fetchConversationHistory]);

  // Persist conversationId to localStorage when it changes
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem('current_conversation_id', conversationId);
    }
  }, [conversationId]);

  // Refetch events when a message is sent (in case a meeting was scheduled)
  useEffect(() => {
    if (user?.calendarConnected && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' &&
          (lastMessage.content.toLowerCase().includes('scheduled') ||
           lastMessage.content.toLowerCase().includes('created') ||
           lastMessage.content.toLowerCase().includes('booked'))) {
        fetchEvents();
      }
    }
  }, [messages, user?.calendarConnected, fetchEvents]);

  const handleLogout = () => {
    if (conversationId) {
      endConversation(conversationId);
    }
    localStorage.removeItem('current_conversation_id');
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    router.push('/login');
  };

  const startNewChat = () => {
    if (conversationId) {
      endConversation(conversationId);
    }
    localStorage.removeItem('current_conversation_id');
    setMessages([]);
    setConversationId(null);
  };

  const handleSendMessage = async () => {
    if (!message.trim() || isLoading) return;

    const userMessage = message.trim();
    const accessToken = localStorage.getItem('access_token');

    if (!accessToken) {
      router.push('/login');
      return;
    }

    setMessage('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: userMessage,
          conversationId: conversationId,
        }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      const data = await response.json();
      setConversationId(data.conversationId);
      setMessages((prev) => [...prev, { role: 'assistant', content: data.message }]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header user={user} handleLogout={handleLogout} />
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <ChatInterface
          messages={messages}
          isLoading={isLoading}
          message={message}
          setMessage={setMessage}
          handleSendMessage={handleSendMessage}
          startNewChat={startNewChat}
          startOpenAIVoice={startOpenAIVoice}
          startElevenLabsCall={startElevenLabsCall}
          userImage={user.image}
        />
        
        <CalendarView
          user={user}
          events={events}
          eventsLoading={eventsLoading}
          fetchEvents={fetchEvents}
          calendarLoading={calendarLoading}
          connectCalendar={connectCalendar}
        />
      </div>

      <VoiceModal
        showVoiceModal={showVoiceModal}
        voiceMode={voiceMode}
        voiceState={voiceState}
        voiceTranscript={voiceTranscript}
        voiceResponse={voiceResponse}
        endVoiceSession={endVoiceSession}
      />
    </div>
  );
}