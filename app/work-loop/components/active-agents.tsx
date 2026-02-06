"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useWorkLoopState } from "@/lib/hooks/use-work-loop"
import { Cpu, Clock, Terminal, ExternalLink } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

interface ActiveAgentsProps {
  projectId: string
  projectSlug: string
}

export function ActiveAgents({ projectId, projectSlug }: ActiveAgentsProps) {
  const { state, isLoading } = useWorkLoopState(projectId)

  // For now, we show state-based info. In the future, this could fetch
  // detailed child process info from the orchestrator.
  const activeCount = state?.active_agents ?? 0

  // Generate placeholder agent cards based on active count
  // Using useMemo with deterministic values based on index
  const agents = useMemo(() => {
    return Array.from({ length: Math.min(activeCount, 5) }, (_, i) => ({
      id: `agent-${i}`,
      taskId: `task-${i}`,
      taskTitle: `Task ${i + 1}`,
      role: ["dev", "reviewer", "qa", "pm"][i % 4],
      model: ["kimi", "sonnet", "haiku"][i % 3],
      duration: `${(i % 10) + 1}m`,
      lastActivity: "Just now",
    }))
  }, [activeCount])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Active Agents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  if (activeCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Active Agents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No active agents
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Cpu className="h-5 w-5" />
          Active Agents
          <Badge variant="secondary" className="ml-2">
            {activeCount}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              projectSlug={projectSlug}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

interface AgentCardProps {
  agent: {
    id: string
    taskId: string
    taskTitle: string
    role: string
    model: string
    duration: string
    lastActivity: string
  }
  projectSlug: string
}

function AgentCard({ agent, projectSlug }: AgentCardProps) {
  const roleColors: Record<string, string> = {
    dev: "bg-blue-500/20 text-blue-600",
    reviewer: "bg-purple-500/20 text-purple-600",
    qa: "bg-orange-500/20 text-orange-600",
    pm: "bg-green-500/20 text-green-600",
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/projects/${projectSlug}/board?task=${agent.taskId}`}
          className="font-medium text-sm hover:underline line-clamp-1"
        >
          {agent.taskTitle}
        </Link>
        <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
      </div>

      <div className="flex items-center gap-2">
        <Badge
          variant="secondary"
          className={`text-xs ${roleColors[agent.role] || "bg-gray-500/20 text-gray-600"}`}
        >
          {agent.role}
        </Badge>
        <span className="text-xs text-muted-foreground font-mono">
          {agent.model}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {agent.duration}
        </span>
        <span className="flex items-center gap-1">
          <Terminal className="h-3 w-3" />
          {agent.lastActivity}
        </span>
      </div>
    </div>
  )
}
