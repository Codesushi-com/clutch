"use client"

import { Badge } from "@/components/ui/badge"
import type { WorkLoopStatus, WorkLoopPhase } from "@/lib/types/work-loop"

interface StatusBadgeProps {
  status: WorkLoopStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
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

  return (
    <Badge variant={variants[status]}>
      {labels[status]}
    </Badge>
  )
}

interface PhaseBadgeProps {
  phase: WorkLoopPhase
}

export function PhaseBadge({ phase }: PhaseBadgeProps) {
  const colors: Record<WorkLoopPhase, string> = {
    cleanup: "bg-orange-500/20 text-orange-600 border-orange-500/30",
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
