"use client"

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useServerStatus } from "@/lib/hooks/use-server-status"
import type { WorkLoopStatus, WorkLoopPhase } from "@/lib/types/work-loop"

interface StatusBadgeProps {
  status: WorkLoopStatus
  /**
   * When true and status is "running", shows a tooltip with server details
   * on hover. Defaults to true.
   */
  showTooltip?: boolean
}

export function StatusBadge({ status, showTooltip = true }: StatusBadgeProps) {
  const variants: Record<WorkLoopStatus, "default" | "secondary" | "destructive" | "outline"> = {
    running: "default",
    paused: "secondary",
    stopped: "outline",
    error: "destructive",
  }

  const labels: Record<WorkLoopStatus, string> = {
    running: "Running",
    paused: "Paused",
    stopped: "Stopped",
    error: "Error",
  }

  // Only show tooltip for running status
  if (status === "running" && showTooltip) {
    return (
      <ServerStatusBadge status={status}>
        {labels[status]}
      </ServerStatusBadge>
    )
  }

  return (
    <Badge variant={variants[status]}>
      {labels[status]}
    </Badge>
  )
}

/**
 * Wrapper component that adds a tooltip with server status details.
 * Only renders the tooltip when server status data is available.
 */
function ServerStatusBadge({
  children,
}: {
  status: WorkLoopStatus
  children: React.ReactNode
}) {
  const { status: serverStatus, isLoading } = useServerStatus()

  const badge = (
    <Badge variant="default">
      {children}
    </Badge>
  )

  // If loading or no server status, just return the badge without tooltip
  if (isLoading || !serverStatus) {
    return badge
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="max-w-xs p-3 space-y-2"
        >
          <div className="space-y-1">
            <div className="font-medium text-foreground">Server Status</div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between gap-4">
                <span>Started:</span>
                <span className="font-mono text-foreground">
                  {serverStatus.startedAtRelative}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Uptime:</span>
                <span className="font-mono text-foreground">
                  {serverStatus.uptimeFormatted}
                </span>
              </div>
              {serverStatus.commit && (
                <div className="flex justify-between gap-4">
                  <span>Commit:</span>
                  <span className="font-mono text-foreground">
                    {serverStatus.commit}
                  </span>
                </div>
              )}
              {serverStatus.version && (
                <div className="flex justify-between gap-4">
                  <span>Version:</span>
                  <span className="font-mono text-foreground">
                    {serverStatus.version}
                  </span>
                </div>
              )}
            </div>
            <div className="pt-1 text-[10px] text-muted-foreground border-t border-border mt-1">
              {serverStatus.startedAtFormatted}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface PhaseBadgeProps {
  phase: WorkLoopPhase
}

export function PhaseBadge({ phase }: PhaseBadgeProps) {
  const colors: Record<WorkLoopPhase, string> = {
    cleanup: "bg-orange-500/20 text-orange-600 border-orange-500/30",
    triage: "bg-yellow-500/20 text-yellow-600 border-yellow-500/30",
    review: "bg-blue-500/20 text-blue-600 border-blue-500/30",
    work: "bg-green-500/20 text-green-600 border-green-500/30",
    idle: "bg-gray-500/20 text-gray-600 border-gray-500/30",
    error: "bg-red-500/20 text-red-600 border-red-500/30",
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors[phase]}`}
    >
      {phase}
    </span>
  )
}
