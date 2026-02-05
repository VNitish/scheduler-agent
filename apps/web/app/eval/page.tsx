'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser } from '@repo/auth';
import { Button } from '@repo/ui';
import { useTheme } from '../components/theme-provider';

// Types
interface ConversationEval {
  id: string;
  type: 'TEXT' | 'OPENAI_VOICE' | 'ELEVENLABS_VOICE';
  status: string;
  createdAt: string;
  messageCount: number;
  toolCallCount: number;
  evaluation: {
    overallScore: number;
    clarityScore: number;
    helpfulnessScore: number;
    accuracyScore: number;
    efficiencyScore: number;
    evaluatedAt: string;
  } | null;
}

interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

// SVG Icons
const ArrowLeftIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const EvalIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const SunIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const MessageIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const MicIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const PhoneIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const ChevronLeftIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRightIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const LoaderIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

// Score badge component
const ScoreBadge = ({ score }: { score: number }) => {
  let colorClass = 'bg-red-100 text-red-800 border-red-200';
  if (score >= 80) colorClass = 'bg-green-100 text-green-800 border-green-200';
  else if (score >= 60) colorClass = 'bg-yellow-100 text-yellow-800 border-yellow-200';
  else if (score >= 40) colorClass = 'bg-orange-100 text-orange-800 border-orange-200';

  return (
    <span className={`px-2 py-1 text-xs font-medium border ${colorClass}`}>
      {score}
    </span>
  );
};

// Type icon component
const TypeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'TEXT':
      return <MessageIcon className="w-4 h-4" />;
    case 'OPENAI_VOICE':
      return <MicIcon className="w-4 h-4" />;
    case 'ELEVENLABS_VOICE':
      return <PhoneIcon className="w-4 h-4" />;
    default:
      return <MessageIcon className="w-4 h-4" />;
  }
};

export default function EvalPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [conversations, setConversations] = useState<ConversationEval[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, totalCount: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState<string | null>(null);

  const fetchConversations = useCallback(async (page: number = 1) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return;

    setLoading(true);
    try {
      const url = `/api/eval?page=${page}&limit=10`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      router.push('/login');
      return;
    }
    setUser(JSON.parse(userStr));
    fetchConversations(1);
  }, [router, fetchConversations]);

  const handleEvaluate = async (conversationId: string) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return;

    setEvaluating(conversationId);
    try {
      const response = await fetch('/api/eval', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ conversationId }),
      });

      if (response.ok) {
        fetchConversations(pagination.page);
      }
    } catch (error) {
      console.error('Failed to evaluate:', error);
    } finally {
      setEvaluating(null);
    }
  };

  const handlePageChange = (newPage: number) => {
    fetchConversations(newPage);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatType = (type: string) => {
    switch (type) {
      case 'TEXT': return 'Chat';
      case 'OPENAI_VOICE': return 'OpenAI Voice';
      case 'ELEVENLABS_VOICE': return 'ElevenLabs';
      default: return type;
    }
  };

  // Calculate stats
  const totalConversations = pagination.totalCount;
  const evaluatedConversations = conversations.filter(c => c.evaluation).length;
  const avgScore = conversations
    .filter(c => c.evaluation)
    .reduce((sum, c) => sum + (c.evaluation?.overallScore || 0), 0) / (evaluatedConversations || 1);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')} title="Back to Dashboard">
              <ArrowLeftIcon className="w-5 h-5" />
            </Button>
            <EvalIcon className="w-6 h-6" />
            <h1 className="text-lg font-semibold tracking-tight">Evaluation</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={toggleTheme} title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
              {theme === 'light' ? <MoonIcon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />}
            </Button>
            <div className="flex items-center gap-3">
              {user.image && <img src={user.image} alt={user.name} className="w-8 h-8" />}
              <span className="text-sm font-medium">{user.name}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="p-6 max-w-6xl mx-auto">
        {/* Stats Summary */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="border border-border p-4">
            <p className="text-sm text-muted-foreground">Total Sessions</p>
            <p className="text-2xl font-semibold">{totalConversations}</p>
          </div>
          <div className="border border-border p-4">
            <p className="text-sm text-muted-foreground">Evaluated</p>
            <p className="text-2xl font-semibold">{evaluatedConversations}</p>
          </div>
          <div className="border border-border p-4">
            <p className="text-sm text-muted-foreground">Avg Score</p>
            <p className="text-2xl font-semibold">{evaluatedConversations > 0 ? Math.round(avgScore) : '-'}</p>
          </div>
        </div>

        {/* Table */}
        <div className="border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left p-4 text-sm font-medium">Type</th>
                <th className="text-left p-4 text-sm font-medium">Date</th>
                <th className="text-left p-4 text-sm font-medium">Messages</th>
                <th className="text-left p-4 text-sm font-medium">Overall</th>
                <th className="text-left p-4 text-sm font-medium">Clarity</th>
                <th className="text-left p-4 text-sm font-medium">Helpfulness</th>
                <th className="text-left p-4 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center">
                    <LoaderIcon className="w-6 h-6 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mt-2">Loading...</p>
                  </td>
                </tr>
              ) : conversations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center">
                    <EvalIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No conversations found</p>
                  </td>
                </tr>
              ) : (
                conversations.map((conv) => (
                  <tr key={conv.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <TypeIcon type={conv.type} />
                        <span className="text-sm">{formatType(conv.type)}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm">{formatDate(conv.createdAt)}</td>
                    <td className="p-4 text-sm">{conv.messageCount}</td>
                    <td className="p-4">
                      {conv.evaluation ? (
                        <ScoreBadge score={conv.evaluation.overallScore} />
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-4">
                      {conv.evaluation ? (
                        <ScoreBadge score={conv.evaluation.clarityScore} />
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-4">
                      {conv.evaluation ? (
                        <ScoreBadge score={conv.evaluation.helpfulnessScore} />
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-4">
                      <Button
                        variant="bordered"
                        size="sm"
                        onClick={() => handleEvaluate(conv.id)}
                        disabled={evaluating === conv.id}
                      >
                        {evaluating === conv.id ? (
                          <>
                            <LoaderIcon className="w-3 h-3 mr-1" />
                            Evaluating...
                          </>
                        ) : conv.evaluation ? (
                          'Re-evaluate'
                        ) : (
                          'Evaluate'
                        )}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="bordered"
                size="sm"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </Button>
              <span className="text-sm px-2">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="bordered"
                size="sm"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
              >
                <ChevronRightIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
