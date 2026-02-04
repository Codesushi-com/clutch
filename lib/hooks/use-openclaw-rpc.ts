"use client";

import { useCallback } from "react";
import { useOpenClawWS } from "@/lib/providers/openclaw-ws-provider";
import { SessionListResponse, SessionListParams, SessionPreview, AgentListResponse, AgentListParams, AgentDetail, SessionType, Session } from "@/lib/types";

export function useOpenClawRpc() {
  const { status, rpc } = useOpenClawWS();

  // List sessions via RPC
  const listSessions = useCallback(async (params?: SessionListParams): Promise<SessionListResponse> => {
    const response = await rpc<{ sessions: Array<Record<string, unknown>> }>("sessions.list", (params || {}) as Record<string, unknown>);
    // Map OpenClaw's 'key' field to our 'id' field for compatibility
    const sessions = (response.sessions || []).map((s) => ({
      id: s.key as string,
      name: (s.key as string)?.split(':').pop() || 'unknown',
      type: ((s.kind as string) || 'main') as SessionType,
      model: s.model as string,
      status: 'idle' as const,
      updatedAt: s.updatedAt as string,
      createdAt: s.updatedAt as string, // OpenClaw doesn't return createdAt separately
      tokens: {
        input: (s.inputTokens as number) || 0,
        output: (s.outputTokens as number) || 0,
        total: (s.totalTokens as number) || 0,
      },
    }));
    return { sessions, total: sessions.length };
  }, [rpc]);

  // List agents via RPC
  const listAgents = useCallback(async (params?: AgentListParams): Promise<AgentListResponse> => {
    try {
      // Try the agents.list RPC method first
      const response = await rpc<{ agents?: unknown[]; [key: string]: unknown } | unknown[]>("agents.list", (params || {}) as Record<string, unknown>);
      
      // Handle different possible response formats
      if (response && typeof response === 'object' && !Array.isArray(response) && 'agents' in response && Array.isArray(response.agents)) {
        // If agents.list returns properly formatted agents, map them to ensure all fields exist
        const agents = response.agents.map((agent: unknown) => {
          const agentObj = agent as Record<string, unknown>;
          return {
            id: String(agentObj.id || agentObj.key || 'unknown'),
            name: String(agentObj.name || (typeof agentObj.key === 'string' ? agentObj.key.split(':').pop() : 'Unknown Agent')),
            description: String(agentObj.description || 'AI Agent'),
            model: String(agentObj.model || 'Unknown'),
            status: (['active', 'idle', 'offline'].includes(String(agentObj.status))) ? String(agentObj.status) as 'active' | 'idle' | 'offline' : 'idle' as const,
            sessionCount: typeof agentObj.sessionCount === 'number' ? agentObj.sessionCount : 0,
            createdAt: String(agentObj.createdAt || agentObj.updatedAt || new Date().toISOString()),
            updatedAt: String(agentObj.updatedAt || new Date().toISOString()),
            metadata: (agentObj.metadata && typeof agentObj.metadata === 'object') ? agentObj.metadata as Record<string, unknown> : {}
          };
        });
        return { agents, total: agents.length };
      } else if (response && Array.isArray(response)) {
        // If response is directly an array, treat it as agents
        const agents = response.map((agent: unknown) => {
          const agentObj = agent as Record<string, unknown>;
          return {
            id: String(agentObj.id || agentObj.key || 'unknown'),
            name: String(agentObj.name || (typeof agentObj.key === 'string' ? agentObj.key.split(':').pop() : 'Unknown Agent')),
            description: String(agentObj.description || 'AI Agent'),
            model: String(agentObj.model || 'Unknown'),
            status: (['active', 'idle', 'offline'].includes(String(agentObj.status))) ? String(agentObj.status) as 'active' | 'idle' | 'offline' : 'idle' as const,
            sessionCount: typeof agentObj.sessionCount === 'number' ? agentObj.sessionCount : 0,
            createdAt: String(agentObj.createdAt || agentObj.updatedAt || new Date().toISOString()),
            updatedAt: String(agentObj.updatedAt || new Date().toISOString()),
            metadata: (agentObj.metadata && typeof agentObj.metadata === 'object') ? agentObj.metadata as Record<string, unknown> : {}
          };
        });
        return { agents, total: agents.length };
      }
    } catch (error) {
      console.warn('[useOpenClawRpc] agents.list failed, falling back to sessions-based agents:', error);
    }
    
    // Fallback: Convert sessions to agents if agents.list doesn't exist or fails
    try {
      const sessionsResponse = await listSessions();
      const sessionsByAgent = new Map<string, Session[]>();
      
      // Group sessions by agent/model to create virtual agents
      sessionsResponse.sessions.forEach(session => {
        const agentKey = session.model || 'default-agent';
        if (!sessionsByAgent.has(agentKey)) {
          sessionsByAgent.set(agentKey, []);
        }
        sessionsByAgent.get(agentKey)!.push(session);
      });
      
      // Convert session groups to agents
      const agents = Array.from(sessionsByAgent.entries()).map(([agentKey, sessions]) => {
        const latestSession = sessions.sort((a, b) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )[0];
        
        return {
          id: agentKey,
          name: agentKey.replace(/[^a-zA-Z0-9]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          description: `Agent using ${agentKey} model`,
          model: agentKey,
          status: 'idle' as const,
          sessionCount: sessions.length,
          createdAt: sessions.reduce((earliest, session) => 
            session.createdAt < earliest ? session.createdAt : earliest, 
            sessions[0]?.createdAt || new Date().toISOString()
          ),
          updatedAt: latestSession?.updatedAt || new Date().toISOString(),
          metadata: {
            sessionKeys: sessions.map(s => s.id),
            totalTokens: sessions.reduce((total, s) => total + (s.tokens?.total || 0), 0)
          }
        };
      });
      
      return { agents, total: agents.length };
    } catch (sessionError) {
      console.error('[useOpenClawRpc] Failed to get sessions for agent fallback:', sessionError);
      // Return empty result rather than throwing
      return { agents: [], total: 0 };
    }
  }, [rpc, listSessions]);

  // Get specific agent details via RPC
  const getAgent = useCallback(async (agentId: string) => {
    return rpc<{ agent: AgentDetail }>("agents.get", { id: agentId });
  }, [rpc]);

  // Get session preview with history
  const getSessionPreview = useCallback(async (sessionKey: string, limit?: number) => {
    return rpc<SessionPreview>("sessions.preview", { keys: [sessionKey], limit: limit || 50 });
  }, [rpc]);

  // Reset session
  const resetSession = useCallback(async (sessionKey: string) => {
    return rpc<void>("sessions.reset", { sessionKey });
  }, [rpc]);

  // Compact session context
  const compactSession = useCallback(async (sessionKey: string) => {
    return rpc<void>("sessions.compact", { sessionKey });
  }, [rpc]);

  // Cancel running session
  const cancelSession = useCallback(async (sessionKey: string) => {
    return rpc<void>("sessions.cancel", { sessionKey });
  }, [rpc]);

  // Get agent's soul file content
  const getAgentSoul = useCallback(async (agentId: string) => {
    return rpc<{ content: string; exists: boolean }>("agent.soul.get", { id: agentId });
  }, [rpc]);

  // Update agent's soul file content
  const updateAgentSoul = useCallback(async (agentId: string, content: string) => {
    return rpc<void>("agent.soul.update", { id: agentId, content });
  }, [rpc]);

  // Get agent's memory files list
  const getAgentMemoryFiles = useCallback(async (agentId: string) => {
    return rpc<{ files: Array<{ name: string; path: string; isDirectory: boolean }> }>("agent.memory.list", { id: agentId });
  }, [rpc]);

  // Get agent's memory file content
  const getAgentMemoryFile = useCallback(async (agentId: string, filePath: string) => {
    return rpc<{ content: string; exists: boolean }>("agent.memory.get", { id: agentId, path: filePath });
  }, [rpc]);

  // Update agent's memory file content
  const updateAgentMemoryFile = useCallback(async (agentId: string, filePath: string, content: string) => {
    return rpc<void>("agent.memory.update", { id: agentId, path: filePath, content });
  }, [rpc]);

  // Create new agent
  const createAgent = useCallback(async (params: {
    name: string;
    description?: string;
    model?: string;
    soul?: string;
  }) => {
    return rpc<{ agent: AgentDetail }>("agents.create", params);
  }, [rpc]);

  return {
    connected: status === 'connected',
    connecting: status === 'connecting' || status === 'reconnecting',
    connect: () => {
      // Connection is handled by the provider
      console.log('[useOpenClawRpc] Connection is managed by OpenClawWSProvider');
    },
    disconnect: () => {
      // Disconnection is handled by the provider  
      console.log('[useOpenClawRpc] Disconnection is managed by OpenClawWSProvider');
    },
    rpc,
    listSessions,
    listAgents,
    getAgent,
    getSessionPreview,
    resetSession,
    compactSession,
    cancelSession,
    getAgentSoul,
    updateAgentSoul,
    getAgentMemoryFiles,
    getAgentMemoryFile,
    updateAgentMemoryFile,
    createAgent,
  };
}

export default useOpenClawRpc;