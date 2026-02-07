"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useWorkLoopRuns } from "@/lib/hooks/use-work-loop"
import { PhaseBadge } from "./status-badge"
import Link from "next/link"
import { formatDistanceToNow, formatTimestamp } from "@/lib/utils"
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
  skipCount: number
  blockCount: number
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

// Actions that count as "skipped"
const SKIP_ACTIONS = new Set([
  "analyzer_skipped",
  "reviewer_skipped",
  "signals_skip",
])

// Actions that count as "blocked"
const BLOCK_ACTIONS = new Set([
  "limit_reached",
  "tombstone_blocked",
  "no_ready_tasks",
  "capacity_check",
  "worktree_dirty_skip",
])

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

      // Count skips and blocks
      const skipCount = cycleRuns.filter((r) => SKIP_ACTIONS.has(r.action)).length
      const blockCount = cycleRuns.filter((r) => BLOCK_ACTIONS.has(r.action)).length

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
        skipCount,
        blockCount,
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

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm text-muted-foreground whitespace-nowrap cursor-help">
                {formatTimeAgo(cycle.firstRunAt)}
              </span>
            </TooltipTrigger>
            <TooltipContent>{formatTimestamp(cycle.firstRunAt)}</TooltipContent>
          </Tooltip>

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

          {/* Skip/block hints */}
          {cycle.blockCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
              {cycle.blockCount} blocked
            </span>
          )}
          {cycle.skipCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 whitespace-nowrap">
              {cycle.skipCount} skipped
            </span>
          )}

          {/* Duration */}
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatDuration(cycle.totalDurationMs)}
          </span>

          {/* Indicators for important events */}
          <div className="flex items-center gap-2 ml-auto">
            {cycle.hasErrors && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 cursor-help">
                    error
                  </span>
                </TooltipTrigger>
                <TooltipContent>An error occurred this cycle</TooltipContent>
              </Tooltip>
            )}
            {cycle.hasSpawns && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 cursor-help">
                    spawn
                  </span>
                </TooltipTrigger>
                <TooltipContent>An agent was started this cycle</TooltipContent>
              </Tooltip>
            )}
            {cycle.hasClaims && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 cursor-help">
                    claim
                  </span>
                </TooltipTrigger>
                <TooltipContent>A task was picked up for work this cycle</TooltipContent>
              </Tooltip>
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
  const { text, tooltip } = formatAction(run.action, run.details)

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
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground cursor-help border-b border-dotted border-muted-foreground/50">
                {text}
              </span>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground">{text}</span>
        )}
      </div>

      {/* Timestamp */}
      <div className="w-24 flex-shrink-0 text-right text-muted-foreground text-xs">
        {formatTimestamp(run.created_at)}
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

interface FormattedAction {
  text: string
  tooltip?: string
}

/**
 * Format an action string with relevant details for display.
 * Parses the JSON details string to extract meaningful context.
 * Returns both display text and optional tooltip for cryptic terms.
 */
function formatAction(action: string, detailsJson: string | null): FormattedAction {
  if (!detailsJson) {
    return { text: action }
  }

  try {
    const details = JSON.parse(detailsJson) as Record<string, unknown>

    switch (action) {
      case "dependency_blocked":
        return {
          text: details.title ? `blocked: ${details.title}` : action,
        }
      case "task_claimed":
        return {
          text: details.title ? `claimed: ${details.title}` : action,
        }
      case "agent_spawned":
        return {
          text: details.role ? `spawned ${details.role} agent` : action,
        }
      case "spawn_failed":
        return {
          text: details.error ? `spawn failed: ${details.error}` : action,
        }
      case "ready_tasks_found":
        return {
          text: `${details.count ?? 0} ready tasks`,
        }
      case "no_claimable_tasks":
        return {
          text: `${details.readyCount ?? 0} ready but all blocked`,
        }
      case "capacity_check":
        return {
          text: "at capacity",
          tooltip: `Maximum concurrent agents reached. New work will start when a running agent finishes. (${details.reason ?? "limit"})`,
        }
      case "cycle_complete":
        return {
          text: `cycle done (${details.total_actions ?? 0} actions)`,
        }
      case "reviewer_spawned":
        return {
          text: details.prTitle ? `reviewing: ${details.prTitle}` : action,
        }

      // New action types with human-readable descriptions
      case "limit_reached":
        return {
          text: `Hit agent limit (global max ${details.limit ?? 4})`,
          tooltip: "Maximum concurrent agents reached. New work will start when a running agent finishes.",
        }
      case "analyzer_spawned":
        return {
          text: "Spawned post-mortem analyzer",
          tooltip: "An analyzer agent was started to review a completed or failed task.",
        }
      case "analyzer_skipped": {
        const reason = details.reason as string
        const reasonMap: Record<string, string> = {
          recently_reaped: "analyzed recently",
          analyzer_already_running: "analyzer already running",
          task_not_found: "task not found",
          spawn_failed: "failed to spawn",
        }
        return {
          text: `Skipped analysis: ${reasonMap[reason] ?? reason}`,
          tooltip: "Analysis was skipped because the task is not ready for post-mortem analysis.",
        }
      }
      case "reviewer_skipped": {
        const reason = details.reason as string
        return {
          text: `Skipped review: ${reason}`,
          tooltip: "Review was skipped because the task is not ready for code review.",
        }
      }
      case "tombstone_blocked":
        return {
          text: "Skipped (recently failed, cooling down)",
          tooltip: "This task's agent was terminated recently. It will be retried after the cooldown period (10 min).",
        }
      case "no_ready_tasks":
        return {
          text: "No ready tasks",
          tooltip: "No tasks are currently in the 'ready' state and eligible to be worked on.",
        }
      case "fetch_failed":
        return {
          text: details.error ? `Failed to fetch tasks: ${details.error}` : "Failed to fetch tasks",
        }
      case "claim_failed":
        return {
          text: details.title ? `Claim race lost on: ${details.title}` : "Claim race lost",
          tooltip: "Another agent claimed this task first. The work loop will try another task.",
        }
      case "reset_orphaned_in_progress":
        return {
          text: "Rescued orphaned task",
          tooltip: "A task was stuck in 'in_progress' with no active agent. It has been reset to 'ready'.",
        }
      case "clear_stale_agent_fields":
        return {
          text: "Cleared stale agent data",
          tooltip: "Removed old agent session information from a task that no longer has a running agent.",
        }
      case "clear_ghost_agent_in_review":
        return {
          text: "Cleared ghost agent from review task",
          tooltip: "A review task had stale agent data for a non-existent agent. It has been cleaned up.",
        }
      case "agent_stale_reaped":
        return {
          text: "Reaped agent (stale)",
          tooltip: "An agent that was unresponsive has been terminated.",
        }
      case "agent_reaped":
        return {
          text: "Reaped agent (finished)",
          tooltip: "A finished agent has been cleaned up.",
        }
      case "browser_tab_closed":
        return {
          text: "Closed leftover browser tab",
          tooltip: "Cleaned up a browser tab that was left open by a previous agent.",
        }
      case "worktree_removed":
        return {
          text: "Cleaned up worktree",
          tooltip: "Removed a temporary git worktree that was no longer needed.",
        }
      case "worktree_dirty_skip":
        return {
          text: "Skipped dirty worktree cleanup",
          tooltip: "A worktree has uncommitted changes and cannot be safely removed.",
        }
      case "signal_notified":
        return {
          text: "Sent PM signal notification",
          tooltip: "A private message notification was sent via Signal.",
        }
      case "signals_skip":
        return {
          text: "Skipped notifications (none needed)",
          tooltip: "No notifications were sent because none were required at this time.",
        }
      case "signals_error":
        return {
          text: details.error ? `Notification error: ${details.error}` : "Notification error",
        }
      case "signals_requeued":
        return {
          text: `${details.count ?? 0} notifications requeued`,
          tooltip: "Some notifications failed to send and will be retried later.",
        }
      case "notify_failed":
        return {
          text: details.error ? `Failed to send notification: ${details.error}` : "Failed to send notification",
        }
      case "phase_error":
        return {
          text: details.error ? `Phase error: ${details.error}` : "Phase error",
        }
      case "cycle_error":
        return {
          text: details.error ? `Cycle error: ${details.error}` : "Cycle error",
        }
      case "phase_start":
        return {
          text: `Started ${details.phase ?? "phase"}`,
        }
      case "phase_complete":
        return {
          text: `Completed ${details.phase ?? "phase"}`,
        }
      case "phase_failed":
        return {
          text: details.error ? `Phase failed: ${details.error}` : "Phase failed",
        }
      case "tasks_found":
        return {
          text: `${details.count ?? 0} tasks found`,
        }
      default:
        return { text: action }
    }
  } catch {
    return { text: action }
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
