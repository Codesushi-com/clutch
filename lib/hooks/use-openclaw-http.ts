"use client";

/**
 * OpenClaw HTTP API Hook
 *
 * React hook for session actions using HTTP API.
 *
 * NOTE: Session listing has been removed. Use useAgentSessions hook from
 * @/lib/hooks/use-agent-sessions for reactive session data from Convex.
 */

import { useCallback, useState, useEffect } from "react";
import {
  SessionPreview,
  AgentDetail,
} from "@/lib/types";
import * as openclawApi from "@/lib/openclaw/api";

// Re-export API functions for direct use
export { openclawApi };

/**
 * @deprecated Session list with polling has been removed.
 * Use useAgentSessions from @/lib/hooks/use-agent-sessions for reactive session data.
 */
export function useSessionList(_refreshIntervalMs = 30000, _shouldPoll = false) {
  console.warn('[use-openclaw-http] useSessionList is deprecated. Use useAgentSessions from @/lib/hooks/use-agent-sessions');

  return {
    sessions: [],
    isLoading: false,
    error: null,
    isInitialized: true,
    refresh: async () => {
      // No-op: Use useAgentSessions for reactive data
    },
  };
}

/**
 * Hook for a single session's preview data
 */
export function useSessionPreview(sessionKey: string | null) {
  const [preview, setPreview] = useState<SessionPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!sessionKey) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await openclawApi.getSessionPreview(sessionKey);
      setPreview(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load session preview";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [sessionKey]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  return {
    preview,
    isLoading,
    error,
    reload: loadPreview,
  };
}

/**
 * Hook for session actions (reset, compact, cancel)
 */
export function useSessionActions(sessionKey: string | null) {
  const [isResetting, setIsResetting] = useState(false);
  const [isCompacting, setIsCompacting] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  const reset = useCallback(async () => {
    if (!sessionKey) return;
    setIsResetting(true);
    try {
      await openclawApi.resetSession(sessionKey);
    } finally {
      setIsResetting(false);
    }
  }, [sessionKey]);

  const compact = useCallback(async () => {
    if (!sessionKey) return;
    setIsCompacting(true);
    try {
      await openclawApi.compactSession(sessionKey);
    } finally {
      setIsCompacting(false);
    }
  }, [sessionKey]);

  const cancel = useCallback(async () => {
    if (!sessionKey) return;
    setIsCanceling(true);
    try {
      await openclawApi.cancelSession(sessionKey);
    } finally {
      setIsCanceling(false);
    }
  }, [sessionKey]);

  return {
    reset,
    compact,
    cancel,
    isResetting,
    isCompacting,
    isCanceling,
  };
}

/**
 * Drop-in replacement for useOpenClawRpc
 * Uses HTTP API instead of WebSocket
 */
export function useOpenClawHttpRpc() {
  const [connected] = useState(true); // HTTP is always "connected"
  const [connecting] = useState(false);

  /**
   * @deprecated Use useAgentSessions from @/lib/hooks/use-agent-sessions
   */
  const listSessions = useCallback(async (): Promise<{ sessions: []; total: number }> => {
    console.warn('[useOpenClawHttpRpc] listSessions is deprecated. Use useAgentSessions hook');
    return { sessions: [], total: 0 };
  }, []);

  /**
   * @deprecated Use useAgentSessions from @/lib/hooks/use-agent-sessions
   */
  const listSessionsWithEffectiveModel = useCallback(
    async (): Promise<{ sessions: []; total: number }> => {
      console.warn('[useOpenClawHttpRpc] listSessionsWithEffectiveModel is deprecated. Use useAgentSessions hook');
      return { sessions: [], total: 0 };
    },
    []
  );

  const getSessionPreview = useCallback(
    async (sessionKey: string, limit?: number): Promise<SessionPreview> => {
      return openclawApi.getSessionPreview(sessionKey, limit);
    },
    []
  );

  const resetSession = useCallback(async (sessionKey: string): Promise<void> => {
    return openclawApi.resetSession(sessionKey);
  }, []);

  const compactSession = useCallback(async (sessionKey: string): Promise<void> => {
    return openclawApi.compactSession(sessionKey);
  }, []);

  const cancelSession = useCallback(async (sessionKey: string): Promise<void> => {
    return openclawApi.cancelSession(sessionKey);
  }, []);

  const patchSession = useCallback(async (sessionKey: string, updates: { model?: string; [key: string]: unknown }): Promise<void> => {
    return openclawApi.patchSession(sessionKey, updates);
  }, []);

  // Stub implementations for agent methods (not implemented in HTTP API yet)
  const listAgents = useCallback(async (): Promise<{ agents: []; total: number }> => {
    return { agents: [], total: 0 };
  }, []);

  const getAgent = useCallback(async (_agentId: string): Promise<{ agent: AgentDetail }> => {
    throw new Error("getAgent not implemented in HTTP API");
  }, []);

  const getAgentSoul = useCallback(async (_agentId: string): Promise<{ content: string; exists: boolean }> => {
    throw new Error("getAgentSoul not implemented in HTTP API");
  }, []);

  const updateAgentSoul = useCallback(async (_agentId: string, _content: string): Promise<void> => {
    throw new Error("updateAgentSoul not implemented in HTTP API");
  }, []);

  const getAgentMemoryFiles = useCallback(async (_agentId: string): Promise<{ files: Array<{ name: string; path: string; isDirectory: boolean }> }> => {
    throw new Error("getAgentMemoryFiles not implemented in HTTP API");
  }, []);

  const getAgentMemoryFile = useCallback(async (_agentId: string, _filePath: string): Promise<{ content: string; exists: boolean }> => {
    throw new Error("getAgentMemoryFile not implemented in HTTP API");
  }, []);

  const updateAgentMemoryFile = useCallback(async (_agentId: string, _filePath: string, _content: string): Promise<void> => {
    throw new Error("updateAgentMemoryFile not implemented in HTTP API");
  }, []);

  const createAgent = useCallback(async (_params: { name: string; description?: string; model?: string; soul?: string }): Promise<{ agent: AgentDetail }> => {
    throw new Error("createAgent not implemented in HTTP API");
  }, []);

  const updateAgentConfig = useCallback(async (_agentId: string, _config: Record<string, unknown>): Promise<{ agent: AgentDetail }> => {
    throw new Error("updateAgentConfig not implemented in HTTP API");
  }, []);

  const getGatewayStatus = useCallback(async (): Promise<null> => {
    return null;
  }, []);

  const rpc = useCallback(async <T,>(method: string, params?: Record<string, unknown>): Promise<T> => {
    return rpcCall<T>(method, params);
  }, []);

  return {
    connected,
    connecting,
    connect: () => {},
    disconnect: () => {},
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
    patchSession,
  };
}

// Generic RPC call for compatibility
async function rpcCall<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  switch (method) {
    case "sessions.list":
      console.warn('[rpcCall] sessions.list is deprecated. Use useAgentSessions hook');
      return { sessions: [], total: 0 } as unknown as T;
    case "sessions.preview":
      return (await openclawApi.getSessionPreview(
        (params?.keys as string[])?.[0] || "",
        params?.limit as number
      )) as unknown as T;
    case "sessions.reset":
      await openclawApi.resetSession((params?.sessionKey as string) || "");
      return undefined as T;
    case "sessions.compact":
      await openclawApi.compactSession((params?.sessionKey as string) || "");
      return undefined as T;
    case "sessions.cancel":
      await openclawApi.cancelSession((params?.sessionKey as string) || "");
      return undefined as T;
    case "sessions.patch":
      await openclawApi.patchSession(
        (params?.key as string) || "",
        { model: params?.model as string | undefined }
      );
      return undefined as T;
    default:
      throw new Error(`Method ${method} not implemented in HTTP API`);
  }
}
