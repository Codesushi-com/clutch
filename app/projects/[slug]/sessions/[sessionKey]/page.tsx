'use client';

/**
 * Session Detail Page
 * 
 * Displays the full agent session log — messages exchanged, tool calls made,
 * and final output. Linked from task history timeline.
 * 
 * URL: /projects/{slug}/sessions/{sessionKey}
 */

import { useEffect, useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Loader2, 
  AlertCircle, 
  Bot, 
  User, 
  Terminal,
  Clock,
  Hash,
  BarChart3,
  FileText,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { openclawApi } from '@/lib/hooks/use-openclaw-http';
import type { SessionPreview, SessionMessage } from '@/lib/types';

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolResult {
  tool_call_id: string;
  content: string;
}

interface EnhancedMessage extends SessionMessage {
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
  model?: string;
  stop_reason?: string;
}

interface SessionData extends SessionPreview {
  messages: EnhancedMessage[];
  startTime?: number;
  endTime?: number;
  stopReason?: string;
}

export default function SessionDetailPage({ params }: { params: Promise<{ slug: string; sessionKey: string }> }) {
  const { slug, sessionKey: encodedSessionKey } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Decode the session key (URL-encoded)
  const sessionKey = decodeURIComponent(encodedSessionKey);
  
  // Get task ID from query param for back navigation
  const taskId = searchParams.get('task');
  
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('messages');
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    async function loadSession() {
      try {
        setIsLoading(true);
        setError(null);
        
        // Try to load from JSONL file first (more detailed)
        const jsonlResponse = await fetch(`/api/sessions/${encodeURIComponent(sessionKey)}/history`);
        
        if (jsonlResponse.ok) {
          const jsonlData = await jsonlResponse.json();
          setSessionData({
            session: jsonlData.session || {
              id: sessionKey,
              name: sessionKey.split(':').pop() || sessionKey,
              type: 'subagent',
              model: jsonlData.model || 'unknown',
              status: jsonlData.stopReason ? 'completed' : 'running',
              createdAt: jsonlData.startTime ? new Date(jsonlData.startTime).toISOString() : new Date().toISOString(),
              updatedAt: jsonlData.endTime ? new Date(jsonlData.endTime).toISOString() : new Date().toISOString(),
              tokens: {
                input: jsonlData.tokensIn || 0,
                output: jsonlData.tokensOut || 0,
                total: (jsonlData.tokensIn || 0) + (jsonlData.tokensOut || 0),
              },
            },
            messages: jsonlData.messages || [],
            contextPercentage: 0,
            startTime: jsonlData.startTime,
            endTime: jsonlData.endTime,
            stopReason: jsonlData.stopReason,
          });
        } else {
          // Fallback to RPC API
          const preview = await openclawApi.getSessionPreview(sessionKey, 100);
          setSessionData({
            ...preview,
            messages: preview.messages as EnhancedMessage[],
          });
        }
      } catch (err) {
        console.error('Failed to load session:', err);
        setError(err instanceof Error ? err.message : 'Failed to load session');
      } finally {
        setIsLoading(false);
      }
    }

    loadSession();
  }, [sessionKey]);

  const toggleToolExpansion = (toolId: string) => {
    const newExpanded = new Set(expandedTools);
    if (newExpanded.has(toolId)) {
      newExpanded.delete(toolId);
    } else {
      newExpanded.add(toolId);
    }
    setExpandedTools(newExpanded);
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Ignore copy errors
    }
  };

  const formatDuration = (ms: number): string => {
    if (!ms || ms <= 0) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const formatTokens = (count: number): string => {
    if (!count) return '0';
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin mb-4 text-[var(--accent-blue)]" />
        <p className="text-[var(--text-secondary)]">Loading session logs...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <BackNavigation slug={slug} taskId={taskId} />
        
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-8 text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
            Session Not Found
          </h1>
          <p className="text-[var(--text-secondary)] mb-4">
            {error.includes('not found') 
              ? `The session "${sessionKey}" could not be found. It may have expired or been removed.` 
              : error}
          </p>
          <Button onClick={() => router.push(`/projects/${slug}/board`)} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Board
          </Button>
        </div>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="space-y-6">
        <BackNavigation slug={slug} taskId={taskId} />
        
        <div className="rounded-lg border p-8 text-center">
          <AlertCircle className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
            No Session Data
          </h1>
          <p className="text-[var(--text-secondary)]">
            No data available for this session.
          </p>
        </div>
      </div>
    );
  }

  const session = sessionData.session;
  const duration = sessionData.startTime && sessionData.endTime 
    ? sessionData.endTime - sessionData.startTime 
    : null;

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <BackNavigation slug={slug} taskId={taskId} sessionKey={sessionKey} />

      {/* Session Header */}
      <div className="border border-[var(--border)] rounded-lg bg-[var(--bg-secondary)] p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
              Session Log
            </h1>
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] font-mono">
              <Hash className="h-4 w-4" />
              {sessionKey}
              <button
                onClick={() => copyToClipboard(sessionKey, 'session-key')}
                className="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                title="Copy session key"
              >
                {copiedId === 'session-key' ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>
          
          <Badge 
            variant="outline" 
            className={getStatusColor(session.status)}
          >
            {session.status}
          </Badge>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetadataItem 
            icon={Bot} 
            label="Model" 
            value={session.model || 'Unknown'} 
          />
          <MetadataItem 
            icon={Clock} 
            label="Duration" 
            value={formatDuration(duration || 0)} 
          />
          <MetadataItem 
            icon={BarChart3} 
            label="Tokens" 
            value={`${formatTokens(session.tokens.input)} in / ${formatTokens(session.tokens.output)} out`} 
          />
          <MetadataItem 
            icon={FileText} 
            label="Messages" 
            value={sessionData.messages?.length.toString() || '0'} 
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="messages" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Messages
          </TabsTrigger>
          <TabsTrigger value="raw" className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Raw JSON
          </TabsTrigger>
        </TabsList>

        <TabsContent value="messages" className="mt-4">
          <MessageTimeline 
            messages={sessionData.messages}
            expandedTools={expandedTools}
            onToggleTool={toggleToolExpansion}
          />
        </TabsContent>

        <TabsContent value="raw" className="mt-4">
          <RawJsonView data={sessionData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BackNavigation({ 
  slug, 
  taskId, 
  sessionKey 
}: { 
  slug: string; 
  taskId: string | null;
  sessionKey?: string;
}) {
  const backHref = taskId 
    ? `/projects/${slug}/board?task=${taskId}`
    : `/projects/${slug}/board`;
  
  const backText = taskId 
    ? `Back to Task #${taskId.slice(0, 8)}`
    : 'Back to Board';

  return (
    <div className="flex items-center gap-4">
      <Button variant="ghost" asChild>
        <Link href={backHref}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {backText}
        </Link>
      </Button>
      
      {sessionKey && (
        <span className="text-sm text-[var(--text-muted)]">
          Session: {sessionKey.split(':').pop()}
        </span>
      )}
    </div>
  );
}

function MetadataItem({ 
  icon: Icon, 
  label, 
  value 
}: { 
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-[var(--bg-primary)] rounded-lg p-3">
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-1">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-sm font-medium text-[var(--text-primary)] truncate">
        {value}
      </div>
    </div>
  );
}

function MessageTimeline({ 
  messages,
  expandedTools,
  onToggleTool
}: { 
  messages: EnhancedMessage[];
  expandedTools: Set<string>;
  onToggleTool: (id: string) => void;
}) {
  if (!messages || messages.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border)] p-8 text-center">
        <AlertCircle className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
        <p className="text-[var(--text-secondary)]">No messages in this session.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message, index) => (
        <MessageBubble 
          key={message.id || index} 
          message={message}
          expandedTools={expandedTools}
          onToggleTool={onToggleTool}
        />
      ))}
    </div>
  );
}

function MessageBubble({ 
  message,
  expandedTools,
  onToggleTool
}: { 
  message: EnhancedMessage;
  expandedTools: Set<string>;
  onToggleTool: (id: string) => void;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser 
          ? 'bg-[var(--accent-blue)] text-white' 
          : isSystem 
            ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
            : 'bg-[var(--accent-green)] text-white'
      }`}>
        {isUser ? <User className="h-4 w-4" /> : isSystem ? <Terminal className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      
      {/* Content */}
      <div className={`flex-1 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        {/* Header */}
        <div className={`flex items-center gap-2 mb-1 ${isUser ? 'justify-end' : ''}`}>
          <span className="text-xs font-medium text-[var(--text-secondary)] capitalize">
            {message.role}
          </span>
          {message.model && (
            <span className="text-xs text-[var(--text-muted)]">
              ({message.model.split('/').pop()})
            </span>
          )}
          {message.timestamp && (
            <span className="text-xs text-[var(--text-muted)]">
              <Clock className="h-3 w-3 inline mr-1" />
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
        
        {/* Message Content */}
        <div className={`inline-block text-left rounded-lg px-4 py-3 ${
          isUser 
            ? 'bg-[var(--accent-blue)] text-white' 
            : isSystem
              ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border)]'
              : 'bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)]'
        }`}>
          {message.content ? (
            <div className="whitespace-pre-wrap text-sm">
              {message.content}
            </div>
          ) : (
            <span className="text-sm italic opacity-50">(no content)</span>
          )}
        </div>
        
        {/* Tool Calls */}
        {message.tool_calls && message.tool_calls.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.tool_calls.map((tool) => (
              <ToolCallDisplay 
                key={tool.id}
                tool={tool}
                result={message.tool_results?.find(r => r.tool_call_id === tool.id)}
                isExpanded={expandedTools.has(tool.id)}
                onToggle={() => onToggleTool(tool.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallDisplay({ 
  tool, 
  result,
  isExpanded,
  onToggle
}: { 
  tool: ToolCall;
  result?: ToolResult;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--bg-tertiary)] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-[var(--bg-secondary)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-[var(--accent-blue)]" />
          <span className="text-sm font-medium text-[var(--text-primary)]">
            → {tool.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <Badge variant="outline" className="text-xs">
              Result
            </Badge>
          )}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
          )}
        </div>
      </button>
      
      {isExpanded && (
        <div className="border-t border-[var(--border)] p-3 space-y-3">
          {/* Arguments */}
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-1">Arguments:</div>
            <pre className="text-xs bg-[var(--bg-primary)] p-2 rounded overflow-x-auto">
              {JSON.stringify(tool.arguments, null, 2)}
            </pre>
          </div>
          
          {/* Result */}
          {result && (
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Result:</div>
              <pre className="text-xs bg-[var(--bg-primary)] p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
                {result.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RawJsonView({ data }: { data: unknown }) {
  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] p-4">
      <pre className="text-xs text-[var(--text-secondary)] overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'running':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'completed':
      return 'bg-green-500/10 text-green-600 border-green-500/20';
    case 'error':
      return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'cancelled':
      return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
    default:
      return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
  }
}
