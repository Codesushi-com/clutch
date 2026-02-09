"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useActiveAgentSessions } from "@/lib/hooks/use-work-loop"
import { Cpu, Clock, Terminal, ExternalLink } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"
import { formatTimestamp } from "@/lib/utils"

interface ActiveAgentsProps {
  projectId: string
  projectSlug: string
  projectName?: string
}

export function ActiveAgents({ projectId, projectSlug, projectName }: ActiveAgentsProps) {
  const { data, isLoading } = useActiveAgentSessions(projectId)

  // Transform to agent cards with session data
  const agents = useMemo(() => {
    if (!data) return []
    return data.map((item, index) => ({
      id: item.task.id,
      taskId: item.task.id,
      taskTitle: item.task.title?.trim() || `Untitled Task ${index + 1}`,
      role: item.task.role ?? "dev",
      // Session data (now from sessions table via Convex)
      sessionKey: item.task.agent_session_key,
      model: item.session?.model ?? "unknown",
      provider: item.session?.provider ?? null,
      status: item.session?.status ?? "idle",
      tokensInput: item.session?.tokens_input ?? 0,
      tokensOutput: item.session?.tokens_output ?? 0,
      tokensTotal: item.session?.tokens_total ?? 0,
      costTotal: item.session?.cost_total ?? 0,
      lastActiveAt: item.session?.last_active_at ?? null,
      outputPreview: item.session?.output_preview ?? null,
      stopReason: item.session?.stop_reason ?? null,
      sessionCreatedAt: item.session?.created_at ?? null,
      sessionUpdatedAt: item.session?.updated_at ?? 0,
      projectName: projectName,
    }))
  }, [data, projectName])

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
    sessionKey: string | null
    model: string
    provider: string | null
    status: string
    tokensInput: number
    tokensOutput: number
    tokensTotal: number
    costTotal: number
    lastActiveAt: number | null
    outputPreview: string | null
    stopReason: string | null
    sessionCreatedAt: number | null
    sessionUpdatedAt: number
    projectName?: string
  }
  projectSlug: string
}

function AgentCard({ agent, projectSlug }: AgentCardProps) {
  const roleColors: Record<string, string> = {
    dev: "bg-blue-500/20 text-blue-600",
    reviewer: "bg-purple-500/20 text-purple-600",
    qa: "bg-orange-500/20 text-orange-600",
    pm: "bg-green-500/20 text-green-600",
    research: "bg-cyan-500/20 text-cyan-600",
    conflict_resolver: "bg-red-500/20 text-red-600",
  }

  const statusColors: Record<string, string> = {
    active: "bg-green-500",
    idle: "bg-yellow-500",
    completed: "bg-blue-500",
    stale: "bg-gray-500",
  }

  const taskUrl = `/projects/${projectSlug}/board?task=${agent.taskId}`
  const sessionUrl = agent.sessionKey ? `/sessions/${encodeURIComponent(agent.sessionKey)}` : null

  // Format model name for display
  const displayModel = useMemo(() => {
    if (agent.model === "unknown") return "unknown"
    // Extract short name from full model path (e.g., "anthropic/claude-sonnet-4" -> "claude-sonnet")
    const parts = agent.model.split('/')
    const shortName = parts[parts.length - 1]
    // Remove version numbers and provider prefixes for cleaner display
    return shortName
      .replace(/^claude-/, '')
      .replace(/-4-[0-9]+$/, '')
      .replace(/-[0-9.]+$/, '')
      .replace(/-preview$/, '')
  }, [agent.model])

  // Calculate duration from session start time
  const duration = useMemo(() => {
    if (!agent.sessionCreatedAt) return "Unknown"
    return formatDuration(agent.sessionCreatedAt)
  }, [agent.sessionCreatedAt])

  // Format last activity
  const lastActivity = useMemo(() => {
    if (!agent.lastActiveAt) return "Unknown"
    return formatLastActivity(agent.lastActiveAt)
  }, [agent.lastActiveAt])

  // Format token count
  const tokenDisplay = useMemo(() => {
    if (agent.tokensTotal === 0) return null
    if (agent.tokensTotal >= 1000000) {
      return `${(agent.tokensTotal / 1000000).toFixed(1)}M`
    }
    if (agent.tokensTotal >= 1000) {
      return `${(agent.tokensTotal / 1000).toFixed(1)}k`
    }
    return `${agent.tokensTotal}`
  }, [agent.tokensTotal])

  // Format cost
  const costDisplay = useMemo(() => {
    if (!agent.costTotal || agent.costTotal === 0) return null
    if (agent.costTotal < 0.01) return "<$0.01"
    return `$${agent.costTotal.toFixed(2)}`
  }, [agent.costTotal])

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 hover:border-primary/50 transition-colors">
      {/* Header: Task title and links */}
      <div className="flex items-start justify-between gap-2">
        <Link
          href={taskUrl}
          className="font-medium text-sm hover:underline line-clamp-1"
          title={agent.taskTitle}
        >
          {agent.taskTitle}
        </Link>
        <div className="flex items-center gap-1 flex-shrink-0">
          {sessionUrl && (
            <Link 
              href={sessionUrl} 
              className="hover:text-primary transition-colors"
              title="View session"
            >
              <Terminal className="h-3 w-3 text-muted-foreground" />
            </Link>
          )}
          <Link href={taskUrl} className="hover:text-primary transition-colors">
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </Link>
        </div>
      </div>

      {/* Role, Model, and Status */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant="secondary"
          className={`text-xs ${roleColors[agent.role] || "bg-gray-500/20 text-gray-600"}`}
        >
          {agent.role}
        </Badge>
        <span className="text-xs text-muted-foreground font-mono">
          {displayModel}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-block w-2 h-2 rounded-full ${statusColors[agent.status] || "bg-gray-500"}`} />
          </TooltipTrigger>
          <TooltipContent>
            Session status: {agent.status}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Project name (if showing multi-project view) */}
      {agent.projectName && (
        <div className="text-xs text-muted-foreground">
          {agent.projectName}
        </div>
      )}

      {/* Metrics: Duration, Activity, Tokens, Cost */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 cursor-help">
              <Clock className="h-3 w-3" />
              {duration}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Started: {agent.sessionCreatedAt ? formatTimestamp(agent.sessionCreatedAt) : "Unknown"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 cursor-help">
              <Terminal className="h-3 w-3" />
              {lastActivity}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Last activity: {agent.lastActiveAt ? formatTimestamp(agent.lastActiveAt) : "Unknown"}
          </TooltipContent>
        </Tooltip>

        {tokenDisplay && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help">
                {tokenDisplay} tokens
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {agent.tokensInput.toLocaleString()} in / {agent.tokensOutput.toLocaleString()} out
            </TooltipContent>
          </Tooltip>
        )}

        {costDisplay && (
          <span className="text-green-600">{costDisplay}</span>
        )}
      </div>

      {/* Output preview (if available) */}
      {agent.outputPreview && (
        <div className="text-xs text-muted-foreground border-t pt-2 mt-2 line-clamp-2">
          {agent.outputPreview}
        </div>
      )}

      {/* Stop reason (if completed) */}
      {agent.stopReason && agent.status === "completed" && (
        <div className="text-xs text-muted-foreground">
          Stopped: {agent.stopReason}
        </div>
      )}
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

// formatTimestamp is imported from @/lib/utils
