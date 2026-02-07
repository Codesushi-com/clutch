"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useWorkLoopRuns } from "@/lib/hooks/use-work-loop"
import { PhaseBadge } from "./status-badge"
import Link from "next/link"
import { formatDistanceToNow } from "@/lib/utils"
import { ChevronRight, ChevronDown } from "lucide-react"
import type { WorkLoopRun } from "@/lib/types/work-loop"

interface ActivityLogProps {
  projectId: string
  projectSlug: string
}

interface CycleGroup {
  cycle: number
  runs: WorkLoopRun[]
  firstRunAt: number
  lastRunAt: number
  totalDurationMs: number
  meaningfulActionCount: number
  hasSpawns: boolean
  hasClaims: boolean
  hasErrors: boolean
}

// Actions that don't count as "meaningful" for action count
const NOISE_ACTIONS = new Set([
  "phase_start",
  "phase_complete",
  "phase_failed",
  "tasks_found",
  "ready_tasks_found",
  "no_claimable_tasks",
  "capacity_check",
])

// Actions that indicate something important happened
const SPAWN_ACTIONS = new Set(["agent_spawned", "reviewer_spawned", "spawn_failed"])
const CLAIM_ACTIONS = new Set(["task_claimed", "dependency_blocked"])
const ERROR_ACTIONS = new Set(["spawn_failed", "phase_failed", "error"])

export function ActivityLog({ projectId, projectSlug }: ActivityLogProps) {
  const { runs, isLoading } = useWorkLoopRuns(projectId, 100)

  // Group runs by cycle and compute metadata
  const cycles = useMemo((): CycleGroup[] => {
    if (!runs || runs.length === 0) return []

    const groups = new Map<number, WorkLoopRun[]>()

    // Group runs by cycle
    for (const run of runs) {
      const existing = groups.get(run.cycle) ?? []
      existing.push(run)
      groups.set(run.cycle, existing)
    }

    // Convert to cycle groups with metadata
    const cycleGroups: CycleGroup[] = []
    for (const [cycle, cycleRuns] of groups) {
      // Sort runs by created_at
      cycleRuns.sort((a, b) => b.created_at - a.created_at)

      const firstRun = cycleRuns[cycleRuns.length - 1]
      const lastRun = cycleRuns[0]

      // Count meaningful actions (excluding noise)
      const meaningfulActionCount = cycleRuns.filter(
        (r) => !NOISE_ACTIONS.has(r.action)
      ).length

      // Check for important actions
      const hasSpawns = cycleRuns.some((r) => SPAWN_ACTIONS.has(r.action))
      const hasClaims = cycleRuns.some((r) => CLAIM_ACTIONS.has(r.action))
      const hasErrors = cycleRuns.some((r) => ERROR_ACTIONS.has(r.action) || r.phase === "error")

      // Calculate total duration from individual action durations
      const totalDurationMs = cycleRuns.reduce((sum, r) => sum + (r.duration_ms ?? 0), 0)

      cycleGroups.push({
        cycle,
        runs: cycleRuns,
        firstRunAt: firstRun?.created_at ?? 0,
        lastRunAt: lastRun?.created_at ?? 0,
        totalDurationMs,
        meaningfulActionCount,
        hasSpawns,
        hasClaims,
        hasErrors,
      })
    }

    // Sort by cycle number descending (newest first)
    return cycleGroups.sort((a, b) => b.cycle - a.cycle)
  }, [runs])

  // Compute which cycles should be expanded by default (those with activity)
  const defaultExpandedCycles = useMemo(() => {
    const toExpand = new Set<number>()
    for (const cycle of cycles) {
      // Expand if has spawns, claims, errors, or meaningful actions
      if (cycle.hasSpawns || cycle.hasClaims || cycle.hasErrors || cycle.meaningfulActionCount > 0) {
        toExpand.add(cycle.cycle)
      }
    }
    return toExpand
  }, [cycles])

  // Use state for expanded cycles, initialized from defaults
  const [expandedCycles, setExpandedCycles] = useState<Set<number>>(defaultExpandedCycles)

  const toggleCycle = (cycle: number) => {
    setExpandedCycles((prev) => {
      const next = new Set(prev)
      if (next.has(cycle)) {
        next.delete(cycle)
      } else {
        next.add(cycle)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  if (!cycles || cycles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            No activity yet
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {cycles.map((cycle) => (
            <CycleRow
              key={cycle.cycle}
              cycle={cycle}
              projectSlug={projectSlug}
              isExpanded={expandedCycles.has(cycle.cycle)}
              onToggle={() => toggleCycle(cycle.cycle)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

interface CycleRowProps {
  cycle: CycleGroup
  projectSlug: string
  isExpanded: boolean
  onToggle: () => void
}

function CycleRow({ cycle, projectSlug, isExpanded, onToggle }: CycleRowProps) {
  return (
    <div className="rounded-md border">
      {/* Cycle Summary Row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}

        <div className="flex-1 flex items-center gap-4 min-w-0">
          <span className="font-semibold whitespace-nowrap">
            Cycle {cycle.cycle}
          </span>

          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatTimeAgo(cycle.firstRunAt)}
          </span>

          {/* Action count badge */}
          <span
            className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
              cycle.meaningfulActionCount > 0
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {cycle.meaningfulActionCount} action
            {cycle.meaningfulActionCount !== 1 ? "s" : ""}
          </span>

          {/* Duration */}
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatDuration(cycle.totalDurationMs)}
          </span>

          {/* Indicators for important events */}
          <div className="flex items-center gap-2 ml-auto">
            {cycle.hasErrors && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                error
              </span>
            )}
            {cycle.hasSpawns && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                spawn
              </span>
            )}
            {cycle.hasClaims && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                claim
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Expanded Detail Rows */}
      {isExpanded && (
        <div className="border-t">
          {cycle.runs.map((run) => (
            <RunRow key={run.id} run={run} projectSlug={projectSlug} />
          ))}
        </div>
      )}
    </div>
  )
}

interface RunRowProps {
  run: WorkLoopRun
  projectSlug: string
}

function RunRow({ run, projectSlug }: RunRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 hover:bg-muted/30 text-sm border-b last:border-b-0">
      {/* Indent to align with cycle chevron */}
      <div className="w-4 flex-shrink-0" />

      {/* Phase badge */}
      <div className="w-20 flex-shrink-0">
        <PhaseBadge phase={run.phase} />
      </div>

      {/* Action */}
      <div className="flex-1 min-w-0 truncate">
        <span className="text-muted-foreground">
          {formatAction(run.action, run.details)}
        </span>
      </div>

      {/* Task link */}
      <div className="w-20 flex-shrink-0 text-right">
        {run.task_id ? (
          <Link
            href={`/projects/${projectSlug}/board?task=${run.task_id}`}
            className="text-xs hover:underline text-primary"
          >
            View task
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* Duration */}
      <div className="w-16 flex-shrink-0 text-right text-muted-foreground">
        {run.duration_ms ? formatDuration(run.duration_ms) : "—"}
      </div>
    </div>
  )
}

/**
 * Format an action string with relevant details for display.
 * Parses the JSON details string to extract meaningful context.
 */
function formatAction(action: string, detailsJson: string | null): string {
  if (!detailsJson) return action

  try {
    const details = JSON.parse(detailsJson) as Record<string, unknown>

    switch (action) {
      case "dependency_blocked":
        return details.title ? `blocked: ${details.title}` : action
      case "task_claimed":
        return details.title ? `claimed: ${details.title}` : action
      case "agent_spawned":
        return details.role ? `spawned ${details.role} agent` : action
      case "spawn_failed":
        return details.error ? `spawn failed: ${details.error}` : action
      case "ready_tasks_found":
        return `${details.count ?? 0} ready tasks`
      case "no_claimable_tasks":
        return `${details.readyCount ?? 0} ready but all blocked`
      case "capacity_check":
        return `at capacity (${details.reason ?? "limit"})`
      case "cycle_complete":
        return `cycle done (${details.total_actions ?? 0} actions)`
      case "reviewer_spawned":
        return details.prTitle ? `reviewing: ${details.prTitle}` : action
      default:
        return action
    }
  } catch {
    return action
  }
}

function formatTimeAgo(timestamp: number): string {
  try {
    return formatDistanceToNow(timestamp, { addSuffix: true })
  } catch {
    return new Date(timestamp).toLocaleTimeString()
  }
}

function formatDuration(ms: number): string {
  if (ms === 0) return "—"
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}
