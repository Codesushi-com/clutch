'use client';

/**
 * Agents Page
 * Shows work loop agent analytics grouped by role
 */

import { useMemo } from 'react';
import { Bot, Activity, Clock, Cpu, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import Link from 'next/link';
import type { Task } from '@/lib/types';
import { useAgentHistory } from '@/lib/hooks/use-work-loop';

interface AgentStats {
  role: string;
  count: number;
  totalTokensIn: number;
  totalTokensOut: number;
  avgDuration: number;
  models: Map<string, number>;
}

/**
 * Finds the first project with work_loop_enabled from the projects list.
 */
function useWorkLoopProject(): { projectId: string; projectSlug: string } | null {
  const projects = useQuery(api.projects.getAll, {});

  if (!projects) return null;

  const enabled = projects.find((p) => p.work_loop_enabled);
  if (!enabled) return null;

  return { projectId: enabled.id, projectSlug: enabled.slug };
}

function calculateStats(tasks: Task[] | null): AgentStats[] {
  if (!tasks || tasks.length === 0) return [];

  const roleMap = new Map<string, AgentStats>();

  for (const task of tasks) {
    const role = task.role || 'any';
    
    if (!roleMap.has(role)) {
      roleMap.set(role, {
        role,
        count: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        avgDuration: 0,
        models: new Map(),
      });
    }

    const stats = roleMap.get(role)!;
    stats.count++;
    stats.totalTokensIn += task.agent_tokens_in || 0;
    stats.totalTokensOut += task.agent_tokens_out || 0;

    // Track model usage
    const model = task.agent_model || 'unknown';
    stats.models.set(model, (stats.models.get(model) || 0) + 1);
  }

  // Calculate average duration for each role
  for (const stats of roleMap.values()) {
    const roleTasks = tasks.filter(t => (t.role || 'any') === stats.role);
    const totalDuration = roleTasks.reduce((acc, t) => {
      if (t.agent_started_at && t.agent_last_active_at) {
        return acc + (t.agent_last_active_at - t.agent_started_at);
      }
      return acc;
    }, 0);
    stats.avgDuration = roleTasks.length > 0 ? totalDuration / roleTasks.length : 0;
  }

  return Array.from(roleMap.values()).sort((a, b) => b.count - a.count);
}

function formatDuration(ms: number): string {
  if (ms === 0) return 'N/A';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function formatTokens(tokens: number): string {
  if (tokens === 0) return '0';
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
}

const roleColors: Record<string, string> = {
  dev: 'bg-blue-500/20 text-blue-600 border-blue-500/30',
  reviewer: 'bg-purple-500/20 text-purple-600 border-purple-500/30',
  qa: 'bg-orange-500/20 text-orange-600 border-orange-500/30',
  pm: 'bg-green-500/20 text-green-600 border-green-500/30',
  research: 'bg-cyan-500/20 text-cyan-600 border-cyan-500/30',
  security: 'bg-red-500/20 text-red-600 border-red-500/30',
  any: 'bg-gray-500/20 text-gray-600 border-gray-500/30',
};

const roleLabels: Record<string, string> = {
  dev: 'Developer',
  reviewer: 'Code Reviewer',
  qa: 'QA Tester',
  pm: 'Project Manager',
  research: 'Researcher',
  security: 'Security',
  any: 'General',
};

function AgentRoleCard({ stats }: { stats: AgentStats }) {
  const colorClass = roleColors[stats.role] || roleColors.any;
  const label = roleLabels[stats.role] || stats.role;
  const totalTokens = stats.totalTokensIn + stats.totalTokensOut;

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <div className={`p-2 rounded-lg ${colorClass}`}>
              <Bot className="h-5 w-5" />
            </div>
            {label}
          </CardTitle>
          <Badge variant="secondary" className="font-mono">
            {stats.count} tasks
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3 w-3" />
              Tokens
            </div>
            <div className="text-lg font-semibold">{formatTokens(totalTokens)}</div>
            <div className="text-xs text-muted-foreground">
              {formatTokens(stats.totalTokensIn)} in / {formatTokens(stats.totalTokensOut)} out
            </div>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="h-3 w-3" />
              Avg Duration
            </div>
            <div className="text-lg font-semibold">{formatDuration(stats.avgDuration)}</div>
          </div>
        </div>

        {/* Models Used */}
        <div>
          <div className="text-xs text-muted-foreground mb-2">Models Used</div>
          <div className="flex flex-wrap gap-2">
            {Array.from(stats.models.entries()).map(([model, count]) => (
              <Badge key={model} variant="outline" className="text-xs font-mono">
                {model.split('/').pop()} ({count})
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentsPageSkeleton() {
  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const project = useWorkLoopProject();
  const { tasks, isLoading } = useAgentHistory(project?.projectId ?? null);

  const stats = useMemo(() => calculateStats(tasks), [tasks]);

  const totalTasks = tasks?.length || 0;
  const totalTokensIn = tasks?.reduce((acc, t) => acc + (t.agent_tokens_in || 0), 0) || 0;
  const totalTokensOut = tasks?.reduce((acc, t) => acc + (t.agent_tokens_out || 0), 0) || 0;
  const activeAgents = tasks?.filter(t => t.agent_session_key && !t.completed_at).length || 0;

  if (isLoading || !project) {
    return <AgentsPageSkeleton />;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Cpu className="h-8 w-8" />
            Agents
          </h1>
          <p className="text-muted-foreground mt-1">
            Work loop agent analytics grouped by role
          </p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-muted-foreground">Total Tasks</div>
            <div className="text-2xl font-bold mt-1">{totalTasks}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-muted-foreground">Active Agents</div>
            <div className="text-2xl font-bold mt-1 text-green-600">
              {activeAgents}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-muted-foreground">Total Roles</div>
            <div className="text-2xl font-bold mt-1 text-blue-600">
              {stats.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-muted-foreground">Total Tokens</div>
            <div className="text-2xl font-bold mt-1">
              {formatTokens(totalTokensIn + totalTokensOut)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Roles Grid */}
      {stats.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stats.map((roleStats) => (
            <AgentRoleCard
              key={roleStats.role}
              stats={roleStats}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No agent activity yet</h3>
              <p className="max-w-md mx-auto">
                Agents will appear here once the work loop starts dispatching tasks. 
                Enable the work loop in project settings to get started.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity Link */}
      {stats.length > 0 && (
        <div className="mt-8 text-center">
          <Link 
            href="/work-loop" 
            className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-2"
          >
            <Activity className="h-4 w-4" />
            View active agents in Work Loop →
          </Link>
        </div>
      )}
    </div>
  );
}
