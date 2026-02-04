"use client";

import { useCallback } from "react";
import { useOpenClawWS } from "@/lib/providers/openclaw-ws-provider";
import { SessionListResponse, SessionListParams, SessionPreview } from "@/lib/types";

export function useOpenClawRpc() {
  const { status, rpc } = useOpenClawWS();

  // List sessions via RPC
  const listSessions = useCallback(async (params?: SessionListParams): Promise<SessionListResponse> => {
    return rpc<SessionListResponse>("sessions.list", (params || {}) as Record<string, unknown>);
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
    getSessionPreview,
    resetSession,
    compactSession,
  };
}

export default useOpenClawRpc;