'use client';

/**
 * Agents Page
 * Manage and monitor AI agents
 */

import { useEffect, useState } from 'react';
import { Bot, Plus, Activity, Zap, Clock, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useOpenClawRpc } from '@/lib/hooks/use-openclaw-rpc';
import { Agent, AgentStatus } from '@/lib/types';

function AgentCard({ agent }: { agent: Agent }) {
  const statusColors = {
    active: 'bg-green-500',
    idle: 'bg-yellow-500',
    offline: 'bg-red-500',
  };

  const statusVariants = {
    active: 'default' as const,
    idle: 'secondary' as const,
    offline: 'destructive' as const,
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">{agent.name}</h3>
            <p className="text-sm text-muted-foreground">{agent.description || 'AI Agent'}</p>
          </div>
        </div>
        <Badge variant={statusVariants[agent.status]}>
          <span 
            className={`w-2 h-2 rounded-full ${statusColors[agent.status]} mr-2`}
          />
          {agent.status}
        </Badge>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Zap className="h-4 w-4" />
          <span>Model: {agent.model}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity className="h-4 w-4" />
          <span>Sessions: {agent.sessionCount}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Created: {formatDate(agent.createdAt)}</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t flex gap-2">
        <Button variant="outline" size="sm" className="flex-1">
          Configure
        </Button>
        <Button variant="outline" size="sm" className="flex-1">
          View Sessions
        </Button>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const { listAgents, connected, connecting } = useOpenClawRpc();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = async () => {
    try {
      setError(null);
      setLoading(true);
      const response = await listAgents();
      setAgents(response.agents);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connected) {
      fetchAgents();
    }
  }, [connected]);

  const activeAgents = agents.filter(a => a.status === 'active');
  const idleAgents = agents.filter(a => a.status === 'idle');
  const totalSessions = agents.reduce((acc, agent) => acc + agent.sessionCount, 0);

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-8 w-8" />
            Agents
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage and monitor your AI agents
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={fetchAgents}
            disabled={loading || connecting}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Agent
          </Button>
        </div>
      </div>

      {/* Connection Status */}
      {connecting && (
        <Alert className="mb-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>
            Connecting to OpenClaw...
          </AlertDescription>
        </Alert>
      )}

      {!connected && !connecting && (
        <Alert className="mb-8" variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Not connected to OpenClaw. Unable to fetch agent data.
          </AlertDescription>
        </Alert>
      )}

      {/* Error Alert */}
      {error && (
        <Alert className="mb-8" variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground">Total Agents</div>
          <div className="text-2xl font-bold mt-1">{agents.length}</div>
        </div>
        
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground">Active</div>
          <div className="text-2xl font-bold mt-1 text-green-600">
            {activeAgents.length}
          </div>
        </div>
        
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground">Idle</div>
          <div className="text-2xl font-bold mt-1 text-yellow-600">
            {idleAgents.length}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground">Total Sessions</div>
          <div className="text-2xl font-bold mt-1">
            {totalSessions}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && connected && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading agents...</span>
        </div>
      )}

      {/* Agents Grid */}
      {!loading && agents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && agents.length === 0 && connected && !error && (
        <div className="text-center py-12">
          <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No agents found</h3>
          <p className="text-muted-foreground mb-4">
            Get started by adding your first AI agent
          </p>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Agent
          </Button>
        </div>
      )}

      {/* Footer info */}
      {agents.length > 0 && (
        <div className="mt-8 text-center">
          <div className="text-sm text-muted-foreground">
            <Activity className="h-4 w-4 inline mr-1" />
            Real-time agent monitoring via OpenClaw RPC
          </div>
        </div>
      )}
    </div>
  );
}