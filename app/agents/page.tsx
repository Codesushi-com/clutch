'use client';

/**
 * Agents Page
 * Manage and monitor AI agents
 */

import { Bot, Plus, Activity, Zap, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type AgentStatus = 'active' | 'idle' | 'offline';

interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  type: string;
  uptime: string;
  tasks: number;
}

// Placeholder data - will be replaced with real data later
const PLACEHOLDER_AGENTS: Agent[] = [
  {
    id: '1',
    name: 'Ada',
    status: 'active',
    type: 'General Assistant',
    uptime: '24h 15m',
    tasks: 142,
  },
  {
    id: '2', 
    name: 'Kimi',
    status: 'active',
    type: 'Coding Agent',
    uptime: '12h 30m',
    tasks: 89,
  },
  {
    id: '3',
    name: 'Researcher Bot',
    status: 'idle',
    type: 'Research Assistant',
    uptime: '2h 45m',
    tasks: 23,
  },
];

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

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">{agent.name}</h3>
            <p className="text-sm text-muted-foreground">{agent.type}</p>
          </div>
        </div>
        <Badge variant={statusVariants[agent.status]}>
          <span 
            className={`w-2 h-2 rounded-full ${statusColors[agent.status]} mr-2`}
          />
          {agent.status}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Uptime: {agent.uptime}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Zap className="h-4 w-4" />
          <span>Tasks: {agent.tasks}</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t flex gap-2">
        <Button variant="outline" size="sm" className="flex-1">
          Configure
        </Button>
        <Button variant="outline" size="sm" className="flex-1">
          View Logs
        </Button>
      </div>
    </div>
  );
}

export default function AgentsPage() {
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
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Agent
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground">Total Agents</div>
          <div className="text-2xl font-bold mt-1">{PLACEHOLDER_AGENTS.length}</div>
        </div>
        
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground">Active</div>
          <div className="text-2xl font-bold mt-1 text-green-600">
            {PLACEHOLDER_AGENTS.filter(a => a.status === 'active').length}
          </div>
        </div>
        
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground">Idle</div>
          <div className="text-2xl font-bold mt-1 text-yellow-600">
            {PLACEHOLDER_AGENTS.filter(a => a.status === 'idle').length}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground">Total Tasks</div>
          <div className="text-2xl font-bold mt-1">
            {PLACEHOLDER_AGENTS.reduce((acc, agent) => acc + agent.tasks, 0)}
          </div>
        </div>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {PLACEHOLDER_AGENTS.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>

      {/* Footer info */}
      <div className="mt-8 text-center">
        <div className="text-sm text-muted-foreground">
          <Activity className="h-4 w-4 inline mr-1" />
          Real-time agent monitoring coming soon
        </div>
      </div>
    </div>
  );
}