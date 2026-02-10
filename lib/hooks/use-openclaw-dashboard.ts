"use client";

/**
 * OpenClaw Dashboard Hook
 * 
 * Provides gateway status and health information for the dashboard widgets.
 * Includes connection status, version, uptime, and model info.
 */

import { useCallback, useEffect, useState } from "react";

export type GatewayStatus = "connected" | "disconnected" | "degraded";

export interface DashboardData {
  status: GatewayStatus;
  version: string;
  uptime: number; // seconds
  defaultModel: string;
  connected: boolean;
}

interface ApiStatusResponse {
  status: string;
  connected: boolean;
  wsUrl?: string;
}

interface GatewayStatusResponse {
  version: string;
  uptime: number;
  sessions?: {
    active: number;
    total: number;
  };
  memory?: {
    backend: string;
  };
  config?: {
    defaults?: {
      model?: string;
    };
  };
}

const POLL_INTERVAL_MS = 30000; // 30 seconds

export function useOpenClawDashboard() {
  const [data, setData] = useState<DashboardData>({
    status: "disconnected",
    version: "unknown",
    uptime: 0,
    defaultModel: "unknown",
    connected: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      // Fetch connection status
      const statusRes = await fetch("/api/openclaw/status", {
        signal: AbortSignal.timeout(5000),
      });

      if (!statusRes.ok) {
        throw new Error(`HTTP ${statusRes.status}`);
      }

      const statusData: ApiStatusResponse = await statusRes.json();

      // Fetch gateway details via RPC proxy
      let gatewayData: GatewayStatusResponse | null = null;
      if (statusData.connected) {
        try {
          const rpcRes = await fetch("/api/openclaw/rpc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "req",
              id: `dash-${Date.now()}`,
              method: "config.get",
              params: {},
            }),
            signal: AbortSignal.timeout(5000),
          });

          if (rpcRes.ok) {
            const rpcResult = await rpcRes.json();
            if (rpcResult.ok && rpcResult.payload) {
              const config = rpcResult.payload;
              gatewayData = {
                version: config.meta?.lastTouchedVersion || "unknown",
                uptime: 0, // Not directly available
                sessions: config.sessions,
                config: {
                  defaults: config.defaults,
                },
              };
            }
          }
        } catch {
          // Gateway RPC failed but we're still connected - show degraded
        }
      }

      const connected = statusData.connected;
      let gatewayStatus: GatewayStatus = connected ? "connected" : "disconnected";
      
      // If connected but couldn't fetch config, mark as degraded
      if (connected && !gatewayData) {
        gatewayStatus = "degraded";
      }

      setData({
        status: gatewayStatus,
        version: gatewayData?.version || "unknown",
        uptime: gatewayData?.uptime || 0,
        defaultModel: gatewayData?.config?.defaults?.model || "unknown",
        connected,
      });
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch status";
      setError(message);
      setData((prev) => ({
        ...prev,
        status: "disconnected",
        connected: false,
      }));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reconnect = useCallback(async () => {
    try {
      const res = await fetch("/api/openclaw/status", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      // Refresh status after reconnect attempt
      await fetchStatus();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Reconnect failed";
      setError(message);
      return false;
    }
  }, [fetchStatus]);

  useEffect(() => {
    fetchStatus();

    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return {
    data,
    isLoading,
    error,
    refresh: fetchStatus,
    reconnect,
  };
}
