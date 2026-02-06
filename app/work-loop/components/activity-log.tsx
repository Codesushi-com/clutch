"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useWorkLoopRuns } from "@/lib/hooks/use-work-loop"
import { PhaseBadge } from "./status-badge"
import Link from "next/link"
import { formatDistanceToNow } from "@/lib/utils"

interface ActivityLogProps {
  projectId: string
  projectSlug: string
}

export function ActivityLog({ projectId, projectSlug }: ActivityLogProps) {
  const { runs, isLoading } = useWorkLoopRuns(projectId, 50)

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

  // Filter out noisy phase lifecycle entries that don't carry useful info
  const NOISE_ACTIONS = new Set(["phase_start", "phase_complete", "phase_failed"])
  const filteredRuns = runs?.filter((r) => !NOISE_ACTIONS.has(r.action)) ?? null

  if (!filteredRuns || filteredRuns.length === 0) {
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
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Task</TableHead>
                <TableHead className="text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRuns.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatTimeAgo(run.created_at)}
                  </TableCell>
                  <TableCell>
                    <PhaseBadge phase={run.phase} />
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatAction(run.action, run.details)}
                  </TableCell>
                  <TableCell>
                    {run.task_id ? (
                      <Link
                        href={`/projects/${projectSlug}/board?task=${run.task_id}`}
                        className="text-sm hover:underline text-primary"
                      >
                        View task
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {run.duration_ms ? (
                      <span className="text-sm text-muted-foreground">
                        {formatDuration(run.duration_ms)}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
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
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}
