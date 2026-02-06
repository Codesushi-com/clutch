"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useWorkLoopState, useWorkLoopStats } from "@/lib/hooks/use-work-loop"
import { Activity, AlertCircle, Clock, Users } from "lucide-react"

interface StatsPanelProps {
  projectId: string
}

export function StatsPanel({ projectId }: StatsPanelProps) {
  const { state, isLoading: stateLoading } = useWorkLoopState(projectId)
  const { stats, isLoading: statsLoading } = useWorkLoopStats(projectId)

  if (stateLoading || statsLoading) {
    return (
      <div className="space-y-4">
        <StatsCardSkeleton />
        <StatsCardSkeleton />
        <StatsCardSkeleton />
        <StatsCardSkeleton />
      </div>
    )
  }

  const formatDuration = (ms: number | null) => {
    if (ms === null) return "—"
    const seconds = Math.round(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Tasks Today
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats?.actions_today ?? 0}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Total Cycles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{state?.current_cycle ?? 0}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Avg Cycle Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatDuration(stats?.avg_cycle_time_ms ?? null)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            Errors Today
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${(stats?.errors_today ?? 0) > 0 ? "text-red-500" : ""}`}>
            {stats?.errors_today ?? 0}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Active Agents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {state?.active_agents ?? 0}
            <span className="text-sm font-normal text-muted-foreground">
              {" "}/ {state?.max_agents ?? 0}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatsCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="h-4 w-24 bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-16 bg-muted rounded animate-pulse" />
      </CardContent>
    </Card>
  )
}
