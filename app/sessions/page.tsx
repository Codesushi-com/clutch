'use client';

/**
 * Sessions List Page
 * Real-time session monitoring with WebSocket updates
 */

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Activity } from 'lucide-react';
import { SessionTable } from '@/components/sessions/session-table';
import { useSessionStore } from '@/lib/stores/session-store';
import { useConnectionStatus } from '@/components/providers/websocket-provider';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

function ConnectionBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    connected: 'default',
    connecting: 'secondary',
    reconnecting: 'secondary',
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
            status === 'connected'
              ? 'bg-green-500'
              : status === 'disconnected'
              ? 'bg-red-500'
              : 'bg-yellow-500'
          }`}
        />
      </span>
      {status}
    </Badge>
  );
}

export default function SessionsPage() {
  const router = useRouter();
  const connectionStatus = useConnectionStatus();
  
  const {
    sessions,
    isLoading,
    isInitialized,
    setSessions,
    setLoading,
    setInitialized,
    setError,
  } = useSessionStore();

  // Load sessions on mount
  const loadSessions = useCallback(async () => {
    if (isInitialized) return;
    
    setLoading(true);
    try {
      const response = await apiClient.listSessions({ limit: 100 });
      setSessions(response.sessions);
      setInitialized(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load sessions';
      setError(message);
    }
  }, [isInitialized, setSessions, setLoading, setInitialized, setError]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const response = await apiClient.listSessions({ limit: 100 });
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
    router.push(`/sessions/${sessionId}`);
  };

  // Count sessions by status
  const runningCount = sessions.filter((s) => s.status === 'running').length;
  const totalTokens = sessions.reduce((acc, s) => acc + s.tokens.total, 0);

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-8 w-8" />
            Sessions
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor and manage OpenClaw sessions in real-time
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <ConnectionBadge status={connectionStatus} />
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

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground">Total Sessions</div>
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

      {/* Session Table */}
      <div className="bg-background rounded-lg">
        <SessionTable onRowClick={handleRowClick} />
      </div>

      {/* Footer info */}
      <div className="mt-6 text-sm text-muted-foreground text-center">
        Click on any session row to view details
      </div>
    </div>
  );
}
