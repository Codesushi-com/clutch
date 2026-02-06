"use client";

import { useCallback } from "react";
import { useOpenClawWS } from "@/lib/providers/openclaw-ws-provider";
import { useSessionStore } from "@/lib/stores/session-store";
import { SessionListResponse, SessionListParams, SessionPreview, AgentListResponse, AgentListParams, AgentDetail, SessionType, Session } from "@/lib/types";

/**
 * Get the context window size for a given model.
 * Returns the maximum number of tokens the model can handle.
 */
function getModelContextWindow(model: string): number {
  const lowerModel = model.toLowerCase();
  
  // Anthropic models
  if (lowerModel.includes("claude-opus-4-6")) return 200000;
  if (lowerModel.includes("claude-opus-4-5")) return 200000;
  if (lowerModel.includes("claude-opus")) return 200000;
  if (lowerModel.includes("claude-sonnet-4")) return 200000;
  if (lowerModel.includes("claude-sonnet")) return 200000;
  if (lowerModel.includes("claude-haiku")) return 200000;
  if (lowerModel.includes("claude")) return 200000;
  
  // Moonshot / Kimi models
  if (lowerModel.includes("kimi-k2-thinking") || lowerModel.includes("kimi-k2.5-thinking")) return 131072; // 128k
  if (lowerModel.includes("kimi-k2")) return 256000;
  if (lowerModel.includes("kimi-for-coding")) return 262144;
  if (lowerModel.includes("kimi")) return 200000;
  if (lowerModel.includes("moonshot")) return 200000;
  
  // OpenAI models
  if (lowerModel.includes("gpt-4.5")) return 128000;
  if (lowerModel.includes("gpt-4o")) return 128000;
  if (lowerModel.includes("gpt-4-turbo")) return 128000;
  if (lowerModel.includes("gpt-4")) return 8192;
  if (lowerModel.includes("gpt-3.5-turbo")) return 16385;
  if (lowerModel.includes("gpt-3.5")) return 4096;
  if (lowerModel.includes("gpt-5")) return 128000;
  
  // Google models
  if (lowerModel.includes("gemini-1.5-pro")) return 2000000;
  if (lowerModel.includes("gemini-1.5-flash")) return 1000000;
  if (lowerModel.includes("gemini-1.5")) return 1000000;
  if (lowerModel.includes("gemini")) return 1000000;
  
  // Z.AI / GLM models
  if (lowerModel.includes("glm-4.5")) return 128000;
  if (lowerModel.includes("glm-4")) return 128000;
  if (lowerModel.includes("glm")) return 128000;
  
  // MiniMax models
  if (lowerModel.includes("minimax")) return 1000000;
  
  // Default fallback for unknown models (assume 128k)
  return 128000;
}

/**
 * Calculate context percentage based on tokens used and model context window.
 */
function calculateContextPercentage(tokensTotal: number, model: string): number {
  const contextWindow = getModelContextWindow(model);
  const percentage = (tokensTotal / contextWindow) * 100;
  return Math.min(percentage, 100); // Cap at 100%
}

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

  // List sessions with effective model extracted from recent messages
  // This fetches sessions.preview to get the actual model used for API calls,
  // which may differ from session.model when model overrides are applied
  const listSessionsWithEffectiveModel = useCallback(async (params?: SessionListParams): Promise<SessionListResponse> => {
    const response = await rpc<{ sessions: Array<Record<string, unknown>> }>("sessions.list", (params || {}) as Record<string, unknown>);
    const sessionRows = response.sessions || [];

    // Get session keys for fetching previews
    const sessionKeys = sessionRows.map((s) => s.key as string);

    // Fetch previews to get actual model from messages
    let previewData: { previews?: Array<{ key: string; items?: Array<{ role?: string; model?: string }> }> } = {};
    if (sessionKeys.length > 0) {
      try {
        previewData = await rpc<{ previews: Array<{ key: string; items?: Array<{ role?: string; model?: string }> }> }>(
          "sessions.preview",
          { keys: sessionKeys, limit: 5 }
        );
      } catch (err) {
        console.warn('[useOpenClawRpc] Failed to fetch session previews:', err);
      }
    }

    // Build a map of session key to effective model from preview messages
    const effectiveModelMap = new Map<string, string>();
    for (const preview of previewData.previews || []) {
      // Find the most recent message with a model field
      for (const item of preview.items || []) {
        if (item.model) {
          effectiveModelMap.set(preview.key, item.model);
          break;
        }
      }
    }

    // Map sessions with effective model
    const sessions = sessionRows.map((s) => {
      const key = s.key as string;
      const effectiveModel = effectiveModelMap.get(key);
      const sessionModel = s.model as string;

      return {
        id: key,
        name: key?.split(':').pop() || 'unknown',
        type: ((s.kind as string) || 'main') as SessionType,
        model: sessionModel,
        effectiveModel: effectiveModel || sessionModel, // Use effective model if available, fallback to session model
        status: 'idle' as const,
        updatedAt: s.updatedAt as string,
        createdAt: s.updatedAt as string,
        tokens: {
          input: (s.inputTokens as number) || 0,
          output: (s.outputTokens as number) || 0,
          total: (s.totalTokens as number) || 0,
        },
      };
    });

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
    try {
      // Try the agents.get RPC method first
      return await rpc<{ agent: AgentDetail }>("agents.get", { id: agentId });
    } catch (error) {
      console.warn('[useOpenClawRpc] agents.get failed, falling back to listAgents:', error);
      
      // Fallback: Get agent from list
      const agentsResponse = await listAgents();
      const agent = agentsResponse.agents.find(a => a.id === agentId);
      
      if (!agent) {
        throw new Error(`Agent with ID "${agentId}" not found`);
      }
      
      // Convert agent list format to agent detail format
      const agentDetail: AgentDetail = {
        ...agent,
        configuration: {
          maxTokens: undefined,
          temperature: undefined,
          systemPrompt: undefined,
        },
        stats: {
          totalMessages: 0,
          averageResponseTime: undefined,
          uptime: undefined,
        },
        activeSessions: [],
        totalTokens: typeof agent.metadata?.totalTokens === 'number' ? agent.metadata.totalTokens : undefined,
        lastActivity: agent.updatedAt,
      };
      
      return { agent: agentDetail };
    }
  }, [rpc, listAgents]);

  // Get session preview with history
  const getSessionPreview = useCallback(async (sessionKey: string, limit?: number): Promise<SessionPreview> => {
    // The API returns { ts: number, previews: Array<{ key, status, items }> }
    // We need to transform this into our SessionPreview format
    type PreviewResponse = {
      ts: number;
      previews: Array<{
        key: string;
        status: "ok" | "empty" | "missing" | "error";
        items: Array<{ role: string; text: string; model?: string }>;
      }>;
    };

    // Fetch both preview and session list data in parallel
    const [previewResponse, sessionsResponse] = await Promise.all([
      rpc<PreviewResponse>("sessions.preview", { keys: [sessionKey], limit: limit || 50 }),
      rpc<{ sessions: Array<Record<string, unknown>> }>("sessions.list", { limit: 100 }),
    ]);

    const previewEntry = previewResponse.previews?.[0];

    if (!previewEntry || previewEntry.status === "missing") {
      throw new Error(`Session "${sessionKey}" not found`);
    }

    if (previewEntry.status === "error") {
      throw new Error(`Failed to load session "${sessionKey}"`);
    }

    // Transform items into SessionMessage format
    const messages: SessionPreview["messages"] = previewEntry.items.map((item, index) => ({
      id: `${sessionKey}-msg-${index}`,
      role: item.role === "user" || item.role === "assistant" || item.role === "system"
        ? item.role
        : "assistant", // Default to assistant for tool/other roles
      content: item.text,
      timestamp: new Date().toISOString(), // Preview items don't include timestamps
    }));

    // Find session data from sessions.list for accurate token counts
    const sessionData = sessionsResponse.sessions?.find(s => s.key === sessionKey);
    
    // Get session data from the store as fallback
    const storedSession = useSessionStore.getState().getSessionById(sessionKey);

    // Determine the model (from preview messages, session data, or store)
    const effectiveModel = previewEntry.items.find(i => i.model)?.model 
      || (sessionData?.model as string)
      || storedSession?.model 
      || "unknown";

    // Get token counts from sessions.list response (most accurate)
    const tokensTotal = (sessionData?.totalTokens as number) 
      || storedSession?.tokens?.total 
      || 0;

    // Calculate context percentage based on tokens used / model context window
    const contextPercentage = effectiveModel !== "unknown" 
      ? calculateContextPercentage(tokensTotal, effectiveModel)
      : 0;

    return {
      session: storedSession || {
        id: sessionKey,
        name: sessionKey.split(":").pop() || sessionKey,
        type: "main",
        model: effectiveModel,
        status: "idle",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tokens: { 
          input: (sessionData?.inputTokens as number) || 0, 
          output: (sessionData?.outputTokens as number) || 0, 
          total: tokensTotal 
        },
      },
      messages,
      contextPercentage,
    };
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

  // Update agent configuration
  const updateAgentConfig = useCallback(async (agentId: string, config: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
    enabled?: boolean;
  }) => {
    return rpc<{ agent: AgentDetail }>("agents.config.update", { id: agentId, config });
  }, [rpc]);

  // Get gateway status and uptime information
  const getGatewayStatus = useCallback(async () => {
    try {
      // Use config.get to get lastTouchedAt as a proxy for restart time
      const configResult = await rpc<{ config?: { meta?: { lastTouchedAt?: string; lastTouchedVersion?: string } } }>("config.get", {});
      if (configResult.config?.meta?.lastTouchedAt) {
        return {
          startedAt: configResult.config.meta.lastTouchedAt,
          version: configResult.config.meta.lastTouchedVersion,
          uptime: Date.now() - new Date(configResult.config.meta.lastTouchedAt).getTime()
        };
      }
      return null;
    } catch (error) {
      // Silently fail - gateway status is optional info
      return null;
    }
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
    listSessionsWithEffectiveModel,
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
    updateAgentConfig,
    getGatewayStatus,
  };
}

export default useOpenClawRpc;