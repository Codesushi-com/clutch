'use client';

/**
 * Sessions List Component
 * Reusable component for displaying sessions with optional project filtering
 * Uses HTTP API for session management and Convex for task associations
 */

import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Activity } from 'lucide-react';
import { SessionTable } from '@/components/sessions/session-table';
import { useSessionStore } from '@/lib/stores/session-store';
import { useOpenClawHttpRpc } from '@/lib/hooks/use-openclaw-http';
import { useTasksBySessionIds } from '@/lib/hooks/use-convex-sessions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Session } from '@/lib/types';

function ConnectionBadge({ connected }: { connected: boolean }) {
  const status = connected ? 'connected' : 'disconnected';
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    connected: 'default',
    disconnected: 'destructive',
  };

  return (
    <Badge variant={variants[status] || 'outline'} className="flex items-center gap-1">
      <span className="relative flex h-2 w-2">
        {status === 'connected' ? (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        ) : null}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            status === 'connected' ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
      </span>
      HTTP API
    </Badge>
  );
}

export interface SessionsListProps {
  /**
   * Optional project slug to filter sessions for a specific project
   * If provided, only shows sessions related to this project
   */
  projectSlug?: string;
  
  /**
   * Custom session navigation for project-scoped sessions
   * If not provided, uses default /sessions/[id] navigation
   */
  onSessionClick?: (sessionId: string) => void;
  
  /**
   * Whether to show stats cards (total, running, tokens)
   * Defaults to true for home page, can be disabled for project pages
   */
  showStats?: boolean;
  
  /**
   * Custom title for the sessions list
   * Defaults to "Sessions" if not provided
   */
  title?: string;
  
  /**
   * Custom description for the sessions list
   */
  description?: string;
}

/**
 * Filter sessions for a specific project
 * Project sessions are identified by session key patterns:
 * - trap:{projectSlug}:* — chat sessions for the project
 * - agent:main:cron:*:trap-{ticketId} — work loop sessions for project tickets
 */
function filterProjectSessions(sessions: Session[], projectSlug: string): Session[] {
  return sessions.filter((session) => {
    const sessionId = session.id;
    
    // Direct project chat sessions: trap:{projectSlug}:*
    if (sessionId.startsWith(`trap:${projectSlug}:`)) {
      return true;
    }
    
    // Work loop sessions for project tickets: agent:main:cron:*:trap-{ticketId}
    if (sessionId.includes(':cron:') && sessionId.includes(`trap-`)) {
      // Extract the part after the last 'trap-' to get potential ticket ID
      const trapIndex = sessionId.lastIndexOf('trap-');
      if (trapIndex !== -1) {
        // For now, we'll include all cron trap sessions since we don't have
        // a direct way to map ticket IDs to projects without additional API calls
        // TODO: Add project-ticket mapping if needed for more precise filtering
        return true;
      }
    }
    
    return false;
  });
}

/**
 * Extract task ID from session ID for cron work loop sessions
 * Pattern: agent:main:cron:*:trap-{ticketId}
 */
function extractTaskIdFromSessionId(sessionId: string): string | null {
  // Direct project chat sessions don't have task IDs in the session key
  if (sessionId.startsWith('trap:')) {
    return null;
  }
  
  // Work loop sessions: agent:main:cron:*:trap-{ticketId}
  const trapMatch = sessionId.match(/trap-([a-f0-9-]+)/);
  if (trapMatch) {
    return trapMatch[1];
  }
  
  return null;
}

/**
 * Enrich sessions with task information
 */
function enrichSessionsWithTasks(
  sessions: Session[],
  tasksBySessionId: Map<string, { id: string; title: string; status: 'backlog' | 'ready' | 'in_progress' | 'in_review' | 'done'; project_id: string }>
): Session[] {
  return sessions.map(session => {
    // First check if we have a task directly associated via session_id
    const taskFromSessionId = tasksBySessionId.get(session.id);
    if (taskFromSessionId) {
      return {
        ...session,
        task: {
          id: taskFromSessionId.id,
          title: taskFromSessionId.title,
          status: taskFromSessionId.status,
        },
      };
    }
    
    // Try to extract task ID from session ID pattern
    const taskId = extractTaskIdFromSessionId(session.id);
    if (taskId) {
      // Look for task with this ID
      for (const [, task] of tasksBySessionId) {
        if (task.id === taskId) {
          return {
            ...session,
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
            },
          };
        }
      }
    }
    
    return session;
  });
}

export function SessionsList({
  projectSlug,
  onSessionClick,
  showStats = true,
  title = 'Sessions',
  description,
}: SessionsListProps) {
  const router = useRouter();
  const { connected, listSessionsWithEffectiveModel } = useOpenClawHttpRpc();
  const [enrichedSessions, setEnrichedSessions] = useState<Session[]>([]);
  
  const {
    sessions: allSessions,
    isLoading,
    isInitialized,
    setSessions,
    setLoading,
    setInitialized,
    setError,
  } = useSessionStore();

  // Get all session IDs for task lookup
  const sessionIds = useMemo(() => allSessions.map(s => s.id), [allSessions]);
  
  // Fetch tasks associated with these sessions using Convex
  const { tasks: tasksData } = useTasksBySessionIds(sessionIds);

  // Build task lookup map with useMemo to prevent re-creation on every render
  const tasksBySessionId = useMemo(() => {
    const map = new Map<string, { id: string; title: string; status: 'backlog' | 'ready' | 'in_progress' | 'in_review' | 'done'; project_id: string }>();
    if (tasksData) {
      for (const task of tasksData) {
        map.set(task.session_id, task);
      }
    }
    return map;
  }, [tasksData]);

  // Enrich sessions with task data
  useEffect(() => {
    if (allSessions.length > 0) {
      const enriched = enrichSessionsWithTasks(allSessions, tasksBySessionId);
      setEnrichedSessions(enriched);
    }
  }, [allSessions, tasksBySessionId]);

  // Fetch sessions via HTTP API with effective model
  const fetchSessions = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) {
      setLoading(true);
    }

    try {
      const response = await listSessionsWithEffectiveModel({ limit: 100 });
      setSessions(response.sessions);
      if (isInitialLoad) {
        setInitialized(true);
      }
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load sessions';
      setError(message);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, [listSessionsWithEffectiveModel, setSessions, setLoading, setInitialized, setError]);

  // Initial load - only once
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!hasLoadedRef.current && !isInitialized) {
      hasLoadedRef.current = true;
      fetchSessions(true);
    }
  }, [fetchSessions, isInitialized]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchSessions(false);
    }, 10000);
    
    return () => clearInterval(intervalId);
  }, [fetchSessions]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const response = await listSessionsWithEffectiveModel({ limit: 100 });
      setSessions(response.sessions);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh sessions';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (sessionId: string) => {
    if (onSessionClick) {
      onSessionClick(sessionId);
    } else {
      const encodedSessionId = encodeURIComponent(sessionId);
      router.push(`/sessions/${encodedSessionId}`);
    }
  };

  // Filter sessions if projectSlug is provided
  const sessions = projectSlug 
    ? filterProjectSessions(enrichedSessions, projectSlug)
    : enrichedSessions;

  // Calculate stats from filtered sessions
  const runningCount = sessions.filter((s) => s.status === 'running').length;
  const totalTokens = sessions.reduce((acc, s) => acc + (s.tokens?.total || 0), 0);

  const defaultDescription = projectSlug 
    ? `Sessions related to ${projectSlug} project`
    : 'Monitor and manage OpenClaw sessions via HTTP API';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-8 w-8" />
            {title}
          </h1>
          <p className="text-muted-foreground mt-1">
            {description || defaultDescription}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <ConnectionBadge connected={connected} />
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Stats - only show if showStats is true */}
      {showStats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium text-muted-foreground">
              {projectSlug ? 'Project Sessions' : 'Total Sessions'}
            </div>
            <div className="text-2xl font-bold mt-1">{sessions.length}</div>
          </div>
          
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium text-muted-foreground">Running</div>
            <div className="text-2xl font-bold mt-1 text-green-600">{runningCount}</div>
          </div>
          
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium text-muted-foreground">Total Tokens</div>
            <div className="text-2xl font-bold mt-1">
              {totalTokens >= 1000000
                ? `${(totalTokens / 1000000).toFixed(1)}M`
                : totalTokens >= 1000
                ? `${(totalTokens / 1000).toFixed(1)}K`
                : totalTokens}
            </div>
          </div>
        </div>
      )}

      {/* Session Table */}
      <div className="bg-background rounded-lg">
        <SessionTable 
          onRowClick={handleRowClick}
          filteredSessions={sessions}
        />
      </div>

      {/* Footer info */}
      <div className="text-sm text-muted-foreground text-center">
        Click on any session row to view details
      </div>
    </div>
  );
}
