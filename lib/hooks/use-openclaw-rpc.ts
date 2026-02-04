"use client";

import { useCallback } from "react";
import { useOpenClawWS } from "@/lib/providers/openclaw-ws-provider";
import { SessionListResponse, SessionListParams, SessionPreview, AgentListResponse, AgentListParams, AgentDetail } from "@/lib/types";

export function useOpenClawRpc() {
  const { status, rpc } = useOpenClawWS();

  // List sessions via RPC
  const listSessions = useCallback(async (params?: SessionListParams): Promise<SessionListResponse> => {
    return rpc<SessionListResponse>("sessions.list", (params || {}) as Record<string, unknown>);
  }, [rpc]);

  // List agents via RPC
  const listAgents = useCallback(async (params?: AgentListParams): Promise<AgentListResponse> => {
    return rpc<AgentListResponse>("agents.list", (params || {}) as Record<string, unknown>);
  }, [rpc]);

  // Get specific agent details via RPC
  const getAgent = useCallback(async (agentId: string) => {
    return rpc<{ agent: AgentDetail }>("agents.get", { id: agentId });
  }, [rpc]);

  // Get session preview with history
  const getSessionPreview = useCallback(async (sessionKey: string, limit?: number) => {
    return rpc<SessionPreview>("sessions.preview", { sessionKey, limit: limit || 50 });
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
  };
}

export default useOpenClawRpc;