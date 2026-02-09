"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useWorkLoopState, useActiveAgentCount } from "@/lib/hooks/use-work-loop"
import { Pause, Play, RotateCw } from "lucide-react"
import type { WorkLoopStatus } from "@/lib/types/work-loop"

interface WorkLoopHeaderStatusProps {
  projectId: string
  workLoopEnabled: boolean
}

export function WorkLoopHeaderStatus({ projectId, workLoopEnabled }: WorkLoopHeaderStatusProps) {
  const { state, isLoading } = useWorkLoopState(projectId)
  const { count: activeAgentCount, isLoading: countLoading } = useActiveAgentCount(projectId)
  const [isUpdating, setIsUpdating] = useState(false)

  // Don't show if work loop is not enabled for this project
  if (!workLoopEnabled) {
    return null
  }

  const handleToggleStatus = async () => {
    if (!state || isUpdating) return

    setIsUpdating(true)
    try {
      const newStatus: WorkLoopStatus = state.status === "running" ? "paused" : "running"
      const response = await fetch("/api/work-loop/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          status: newStatus,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to update status")
      }
    } catch (error) {
      console.error("Failed to toggle status:", error)
    } finally {
      setIsUpdating(false)
    }
  }

  // Status colors
  const statusColors: Record<WorkLoopStatus, string> = {
    running: "bg-green-500",
    paused: "bg-yellow-500",
    stopped: "bg-gray-400",
    error: "bg-red-500",
  }

  const isRunning = state?.status === "running"
  const isPaused = state?.status === "paused"

  return (
    <div className="flex items-center gap-3">
      {/* Status indicator */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            isLoading || !state ? "bg-gray-300 animate-pulse" : statusColors[state.status]
          }`}
        />
        <span className="text-sm text-[var(--text-secondary)]">
          {isLoading || !state ? (
            "Loading..."
          ) : (
            <>
              <span className="capitalize">{state.status}</span>
              {activeAgentCount > 0 && !countLoading && (
                <span className="ml-1 text-[var(--text-muted)]">
                  ({activeAgentCount} agent{activeAgentCount !== 1 ? "s" : ""})
                </span>
              )}
            </>
          )}
        </span>
      </div>

      {/* Pause/Resume button */}
      {!isLoading && state && (
        <Button
          onClick={handleToggleStatus}
          disabled={isUpdating}
          variant={isRunning ? "outline" : "default"}
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs"
        >
          {isUpdating ? (
            <RotateCw className="h-3 w-3 animate-spin" />
          ) : isRunning ? (
            <>
              <Pause className="h-3 w-3" />
              <span>Pause</span>
            </>
          ) : isPaused ? (
            <>
              <Play className="h-3 w-3" />
              <span>Resume</span>
            </>
          ) : (
            <>
              <Play className="h-3 w-3" />
              <span>Start</span>
            </>
          )}
        </Button>
      )}
    </div>
  )
}
