'use client';

/**
 * Sessions List Component
 * Reusable component for displaying sessions with optional project filtering
 * Uses Convex for reactive session data from the sessions table
 *
 * Updated to use the unified sessions table which includes:
 * - main: Main Ada session
 * - agent: Agent sessions
 * - chat: Chat sessions
 * - cron: Cron job sessions
 */

import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Activity, Database } from 'lucide-react';
import { SessionTable } from '@/components/sessions/session-table';
import { useSessions } from '@/lib/hooks/use-sessions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Session, SessionType } from '@/convex/sessions';

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
      <Database className="h-3 w-3" />
      Convex
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
   * Project ID for Convex queries (required for data fetching)
   */
  projectId?: string;

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

  /**
   * Filter by session type
   */
  sessionType?: SessionType;
}

export function SessionsList({
  projectSlug,
  projectId,
  onSessionClick,
  showStats = true,
  title = 'Sessions',
  description,
  sessionType,
}: SessionsListProps) {
  const router = useRouter();

  // Fetch sessions from Convex sessions table (reactive, no polling needed)
  // Note: useSessions uses projectSlug, not projectId
  const { sessions, isLoading } = useSessions(
    { projectSlug: projectSlug || undefined, sessionType },
    100
  );

  const handleRefresh = () => {
    // Convex data is reactive, but we can force a re-render if needed
    // In practice, this is a no-op since Convex handles reactivity
    router.refresh();
  };

  const handleRowClick = (sessionKey: string) => {
    if (onSessionClick) {
      onSessionClick(sessionKey);
    } else {
      const encodedSessionKey = encodeURIComponent(sessionKey);
      router.push(`/sessions/${encodedSessionKey}`);
    }
  };

  // Calculate stats from sessions
  const runningCount = sessions?.filter((s) => s.status === 'active').length ?? 0;
  const totalTokens = sessions?.reduce((acc, s) => acc + (s.tokens_total || 0), 0) ?? 0;
  const totalCost = sessions?.reduce((acc, s) => acc + (s.cost_total || 0), 0) ?? 0;

  const defaultDescription = projectSlug
    ? `Active sessions for the ${projectSlug} project`
    : 'Monitor all sessions in real-time (main, chat, agents, cron)';

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
          <ConnectionBadge connected={true} />
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
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium text-muted-foreground">
              {projectSlug ? 'Project Sessions' : 'Total Sessions'}
            </div>
            <div className="text-2xl font-bold mt-1">{sessions?.length ?? 0}</div>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium text-muted-foreground">Active</div>
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

          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium text-muted-foreground">Total Cost</div>
            <div className="text-2xl font-bold mt-1 text-green-600">
              {totalCost >= 1
                ? `$${totalCost.toFixed(2)}`
                : totalCost >= 0.01
                ? `$${totalCost.toFixed(3)}`
                : totalCost > 0
                ? `$${totalCost.toFixed(4)}`
                : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Session Table */}
      <div className="bg-background rounded-lg">
        <SessionTable
          onRowClick={handleRowClick}
          filteredSessions={sessions || undefined}
        />
      </div>

      {/* Footer info */}
      <div className="text-sm text-muted-foreground text-center">
        Click on any session row to view details
      </div>
    </div>
  );
}
