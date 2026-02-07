"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useActiveAgentTasks } from "@/lib/hooks/use-work-loop"
import { Cpu, Clock, Terminal, ExternalLink } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"
import { formatTimestamp } from "@/lib/utils"

interface ActiveAgentsProps {
  projectId: string
  projectSlug: string
}

export function ActiveAgents({ projectId, projectSlug }: ActiveAgentsProps) {
  const { tasks, isLoading } = useActiveAgentTasks(projectId)

  // Transform tasks to agent cards
  const agents = useMemo(() => {
    if (!tasks) return []
    return tasks.map((task, index) => ({
      id: task.id,
      taskId: task.id,
      taskTitle: task.title?.trim() || `Untitled Task ${index + 1}`,
      role: task.role ?? "dev",
      model: task.agent_model ?? "unknown",
      duration: formatDuration(task.agent_started_at),
      durationTimestamp: task.agent_started_at,
      lastActivity: formatLastActivity(task.agent_last_active_at),
      lastActivityTimestamp: task.agent_last_active_at,
    }))
  }, [tasks])

  const activeCount = agents.length

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
    durationTimestamp: number | null
    lastActivity: string
    lastActivityTimestamp: number | null
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

  const taskUrl = `/projects/${projectSlug}/board?task=${agent.taskId}`

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={taskUrl}
          className="font-medium text-sm hover:underline line-clamp-1"
          title={agent.taskTitle}
        >
          {agent.taskTitle}
        </Link>
        <Link href={taskUrl} className="flex-shrink-0 hover:text-primary transition-colors">
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </Link>
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
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 cursor-help">
              <Clock className="h-3 w-3" />
              {agent.duration}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Started: {agent.durationTimestamp ? formatTimestamp(agent.durationTimestamp) : "Unknown"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 cursor-help">
              <Terminal className="h-3 w-3" />
              {agent.lastActivity}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Last activity: {agent.lastActivityTimestamp ? formatTimestamp(agent.lastActivityTimestamp) : "Unknown"}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

// Helper functions for formatting time

function formatDuration(startedAt: number | null): string {
  if (!startedAt) return "Unknown"

  const elapsed = Date.now() - startedAt
  const minutes = Math.floor(elapsed / 60000)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  return `${minutes}m`
}

function formatLastActivity(lastActiveAt: number | null): string {
  if (!lastActiveAt) return "Unknown"

  const elapsed = Date.now() - lastActiveAt
  const seconds = Math.floor(elapsed / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (seconds < 10) return "Just now"
  if (seconds < 60) return `${seconds}s ago`
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return ">24h ago"
}
