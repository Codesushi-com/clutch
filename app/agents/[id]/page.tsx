'use client';

/**
 * Agent Detail Page
 * View detailed information about a specific agent
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Bot, Loader2, AlertCircle, Activity, Zap, Clock, MessageSquare, Settings, BarChart3, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOpenClawRpc } from '@/lib/hooks/use-openclaw-rpc';
import { AgentDetail, AgentStatus } from '@/lib/types';

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  
  const [isLoading, setIsLoading] = useState(true);
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const { getAgent, connected } = useOpenClawRpc();

  // Simple toast function
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Load agent data
  useEffect(() => {
    const loadAgent = async () => {
      if (!connected || !agentId) return;
      
      try {
        setIsLoading(true);
        const response = await getAgent(agentId);
        setAgent(response.agent);
      } catch (error) {
        console.error('Failed to load agent:', error);
        showToast("Failed to load agent details", "error");
      } finally {
        setIsLoading(false);
      }
    };

    loadAgent();
  }, [agentId, connected, getAgent]);

  // Status colors and variants
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

  const formatDateTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return 'Unknown';
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!agent && !isLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Button variant="ghost" onClick={() => router.push('/agents')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Agents
        </Button>
        <div className="rounded-lg border p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">Agent Not Found</h1>
          <p className="text-muted-foreground">
            The agent you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <Button variant="ghost" onClick={() => router.push('/agents')} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Agents
      </Button>

      <div className="rounded-lg border bg-card p-6">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-muted">
              <Bot className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">{agent?.name}</h1>
              <p className="text-muted-foreground mt-1">{agent?.description || 'AI Agent'}</p>
              <div className="flex items-center gap-2 mt-3">
                <Badge variant={statusVariants[agent?.status as AgentStatus]}>
                  <span className={`w-2 h-2 rounded-full ${statusColors[agent?.status as AgentStatus]} mr-2`} />
                  {agent?.status}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  ID: <span className="font-mono">{agentId}</span>
                </span>
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Configure
            </Button>
          </div>
        </div>

        {/* Core Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="rounded-lg bg-muted p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Model</span>
            </div>
            <div className="font-medium text-lg">{agent?.model}</div>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Active Sessions</span>
            </div>
            <div className="font-medium text-lg">{agent?.sessionCount || 0}</div>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Tokens</span>
            </div>
            <div className="font-medium text-lg">
              {agent?.totalTokens ? agent.totalTokens.toLocaleString() : 'N/A'}
            </div>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Created</span>
            </div>
            <div className="font-medium text-lg">{formatDate(agent?.createdAt || '')}</div>
          </div>
        </div>

        {/* Configuration Section */}
        {agent?.configuration && (
          <div className="border-t pt-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Max Tokens</div>
                <div className="font-medium">{agent.configuration.maxTokens || 'Default'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Temperature</div>
                <div className="font-medium">{agent.configuration.temperature || 'Default'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">System Prompt</div>
                <div className="font-medium">
                  {agent.configuration.systemPrompt ? 'Custom' : 'Default'}
                </div>
              </div>
            </div>
            {agent.configuration.systemPrompt && (
              <div className="mt-4">
                <div className="text-sm text-muted-foreground mb-2">System Prompt</div>
                <div className="bg-muted p-3 rounded-lg text-sm font-mono">
                  {agent.configuration.systemPrompt}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Usage Stats */}
        {agent?.stats && (
          <div className="border-t pt-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Usage Statistics
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg bg-muted p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total Messages</span>
                </div>
                <div className="text-2xl font-bold">{agent.stats.totalMessages.toLocaleString()}</div>
              </div>
              {agent.stats.averageResponseTime && (
                <div className="rounded-lg bg-muted p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Avg Response Time</span>
                  </div>
                  <div className="text-2xl font-bold">{agent.stats.averageResponseTime}ms</div>
                </div>
              )}
              {agent.stats.uptime && (
                <div className="rounded-lg bg-muted p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Uptime</span>
                  </div>
                  <div className="text-2xl font-bold">{agent.stats.uptime}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Active Sessions */}
        {agent?.activeSessions && agent.activeSessions.length > 0 && (
          <div className="border-t pt-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Active Sessions ({agent.activeSessions.length})
            </h2>
            <div className="space-y-2">
              {agent.activeSessions.map((sessionId) => (
                <div key={sessionId} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="font-mono text-sm">{sessionId}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/sessions/${sessionId}`)}
                  >
                    View Details
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Additional Details */}
        <div className="border-t pt-6">
          <h2 className="text-lg font-semibold mb-4">Additional Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-sm text-muted-foreground">Created</div>
              <div className="font-medium">{formatDateTime(agent?.createdAt || '')}</div>
            </div>
            {agent?.updatedAt && (
              <div>
                <div className="text-sm text-muted-foreground">Last Updated</div>
                <div className="font-medium">{formatDateTime(agent.updatedAt)}</div>
              </div>
            )}
            {agent?.lastActivity && (
              <div>
                <div className="text-sm text-muted-foreground">Last Activity</div>
                <div className="font-medium">{formatDateTime(agent.lastActivity)}</div>
              </div>
            )}
          </div>

          {/* Metadata */}
          {agent?.metadata && Object.keys(agent.metadata).length > 0 && (
            <div className="mt-6">
              <div className="text-sm text-muted-foreground mb-2">Metadata</div>
              <pre className="bg-muted p-3 rounded-lg text-sm overflow-auto">
                {JSON.stringify(agent.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Connection Status Warning */}
        {!connected && (
          <div className="border-t pt-6 mt-6">
            <div className="flex items-center gap-2 text-yellow-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">
                Not connected to OpenClaw. Some information may not be current.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-4 right-4 z-50">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg ${
              notification.type === 'success'
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            }`}
          >
            <span className="text-sm">{notification.message}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-white hover:text-gray-200"
              onClick={() => setNotification(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}