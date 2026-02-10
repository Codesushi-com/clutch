"use client";

/**
 * Gateway Health Card
 * 
 * Dashboard widget showing OpenClaw gateway status at a glance.
 * Positioned at the top of the sidebar for immediate visibility.
 */

import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { useOpenClawDashboard, type GatewayStatus } from "@/lib/hooks/use-openclaw-dashboard";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Format uptime in seconds to human-readable string
 * Examples: "3d 14h", "2h 30m", "45s"
 */
function formatUptime(seconds: number): string {
  if (seconds <= 0) return "--";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${Math.floor(seconds / 60)}m`;
}

/**
 * Get status display configuration
 */
function getStatusConfig(status: GatewayStatus): {
  label: string;
  dotClass: string;
  textClass: string;
} {
  switch (status) {
    case "connected":
      return {
        label: "Connected",
        dotClass: "bg-green-500 animate-pulse",
        textClass: "text-green-600",
      };
    case "degraded":
      return {
        label: "Degraded",
        dotClass: "bg-yellow-500",
        textClass: "text-yellow-600",
      };
    case "disconnected":
    default:
      return {
        label: "Disconnected",
        dotClass: "bg-red-500",
        textClass: "text-red-600",
      };
  }
}

/**
 * Truncate model name for display
 */
function formatModelName(model: string): string {
  if (model === "unknown" || !model) return "--";
  
  // Remove provider prefix for cleaner display
  const parts = model.split("/");
  const name = parts[parts.length - 1];
  
  // Truncate if too long
  if (name.length > 25) {
    return name.slice(0, 22) + "...";
  }
  return name;
}

export function GatewayHealthCard() {
  const { data, isLoading, reconnect } = useOpenClawDashboard();

  const statusConfig = useMemo(() => getStatusConfig(data.status), [data.status]);

  const formattedUptime = useMemo(() => formatUptime(data.uptime), [data.uptime]);

  const formattedModel = useMemo(() => formatModelName(data.defaultModel), [data.defaultModel]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <div className="animate-pulse space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-[var(--bg-tertiary)]" />
            <div className="h-4 w-20 rounded bg-[var(--bg-tertiary)]" />
          </div>
          <div className="h-3 w-32 rounded bg-[var(--bg-tertiary)]" />
          <div className="h-3 w-24 rounded bg-[var(--bg-tertiary)]" />
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4 shadow-sm">
        {/* Header: Status indicator + Gateway name */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${statusConfig.dotClass}`}
              aria-hidden="true"
            />
            <span className={`text-sm font-medium ${statusConfig.textClass}`}>
              {statusConfig.label}
            </span>
          </div>
          
          {/* Reconnect button - only shown when disconnected */}
          {!data.connected && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              onClick={reconnect}
              aria-label="Reconnect to gateway"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Gateway label with version */}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-base font-semibold text-[var(--text-primary)]">
            OpenClaw
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            v{data.version}
          </span>
        </div>

        {/* Stats row: Uptime and Model */}
        <div className="mt-3 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--text-secondary)]">Uptime:</span>
            <span className="font-medium text-[var(--text-primary)]">
              {formattedUptime}
            </span>
          </div>
        </div>

        {/* Model info with tooltip */}
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <span className="text-[var(--text-secondary)]">Model:</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="max-w-[180px] truncate font-medium text-[var(--text-primary)] cursor-help">
                {formattedModel}
              </span>
            </TooltipTrigger>
            {data.defaultModel !== "unknown" && data.defaultModel.length > 25 && (
              <TooltipContent>
                <p>{data.defaultModel}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
