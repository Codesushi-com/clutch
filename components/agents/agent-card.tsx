"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { AlertTriangle, ExternalLink, Clock, Activity } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useSessionsByTask, useSession } from "@/lib/hooks/use-sessions"
import type { Task } from "@/lib/types"

interface AgentCardProps {
  task: Task
  projectSlug?: string
}

// Format relative time (e.g., "2m ago", "1h 12m")
function formatRelativeTime(timestamp: string | number | undefined | null): string {
  if (!timestamp) return "unknown"

  const date = typeof timestamp === "string" ? new Date(timestamp) : new Date(timestamp)
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

  if (diffMinutes < 1) return "just now"
  if (diffMinutes < 60) return `${diffMinutes}m`
  if (diffHours < 24) {
    const remainingMinutes = diffMinutes % 60
    return remainingMinutes > 0 ? `${diffHours}h ${remainingMinutes}m` : `${diffHours}h`
  }
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return `${diffDays}d`
}

// Format duration from start time (for runtime display)
function formatDuration(startedAt: string | number | undefined | null): string {
  if (!startedAt) return "unknown"

  const date = typeof startedAt === "string" ? new Date(startedAt) : new Date(startedAt)
  const elapsed = Date.now() - date.getTime()
  const minutes = Math.floor(elapsed / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m`
  return `${Math.floor(elapsed / 1000)}s`
}

// Format token count (e.g., 42000 -> "42k")
function formatTokenCount(count: number | null | undefined): string {
  if (!count) return "0"
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
  return count.toString()
}

// Format model name to short form
function formatModelShort(model: string | null | undefined): string {
  if (!model) return "unknown"

  const parts = model.split("/")
  const name = parts[parts.length - 1] || model

  // Shorten common names
  if (name.includes("kimi-for-coding")) return "kimi"
  if (name.includes("kimi")) return "kimi"
  if (name.includes("claude-opus-4-6")) return "opus 4.6"
  if (name.includes("claude-opus")) return "opus"
  if (name.includes("claude-sonnet-4")) return "sonnet 4"
  if (name.includes("claude-sonnet")) return "sonnet"
  if (name.includes("claude-haiku")) return "haiku"
  if (name.includes("claude")) return "claude"
  if (name.includes("gpt-4.5")) return "gpt-4.5"
  if (name.includes("gpt-4o")) return "gpt-4o"
  if (name.includes("gpt-4")) return "gpt-4"
  if (name.includes("gemini")) return "gemini"
  if (name.includes("glm")) return "glm"

  return name.slice(0, 12)
}

// Get color for idle time indicator
function getIdleColor(minutes: number): string {
  if (minutes < 3) return "text-green-400" // < 3m: green
  if (minutes < 10) return "text-yellow-400" // 3-10m: yellow (warning)
  return "text-red-400" // >= 10m: red (possibly stuck)
}

export function AgentCard({ task, projectSlug }: AgentCardProps) {
  // Get session data: try by task_id first, fall back to agent_session_key
  const { sessions, isLoading: isTaskSessionLoading } = useSessionsByTask(task.id)
  const { session: keySession, isLoading: isKeySessionLoading } = useSession(
    task.agent_session_key ?? ""
  )
  // Prefer task_id match, fall back to session_key match
  const session = sessions?.[0] ?? keySession
  const isSessionLoading = isTaskSessionLoading && isKeySessionLoading

  // Track current time for live updates
  const [now, setNow] = useState(() => Date.now())

  // Update every 10 seconds for live time display
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(interval)
  }, [])

  // Calculate metrics from session data (not task denormalized fields)
  const metrics = useMemo(() => {
    // Use session data only - sessions table is now source of truth
    const createdAt = session?.created_at
    const updatedAt = session?.last_active_at ?? session?.updated_at
    const totalTokens = session?.tokens_total ?? 0
    const model = session?.model

    // Context window varies by model, use 200k as default
    const contextWindow = 200000
    const contextPercent = contextWindow > 0 && totalTokens ? Math.round((totalTokens / contextWindow) * 100) : 0

    // Calculate idle time in minutes
    const updatedTime = typeof updatedAt === 'string' ? new Date(updatedAt).getTime() : updatedAt
    const idleMs = updatedTime ? now - updatedTime : 0
    const idleMinutes = Math.floor(idleMs / (1000 * 60))

    return {
      runtime: formatDuration(createdAt),
      lastOutput: formatRelativeTime(updatedAt),
      idleMinutes,
      totalTokens,
      contextPercent,
      isStuck: idleMinutes >= 10,
      model,
      status: session?.status ?? 'idle',
    }
  }, [session, now])

  // Determine link URL
  const taskUrl = useMemo(() => {
    if (task && projectSlug) {
      return `/projects/${projectSlug}/board?task=${task.id}`
    }
    return session ? `/sessions/${encodeURIComponent(session.session_key)}` : '#'
  }, [task, projectSlug, session])

  const idleColor = getIdleColor(metrics.idleMinutes)

  return (
    <div className="p-2.5 rounded-lg bg-[var(--bg-secondary)]/50 border border-[var(--border)]/50 hover:border-[var(--border)] transition-colors">
      {/* Header: Icon + Title */}
      <div className="flex items-start gap-2">
        <span className="text-sm mt-0.5" title="Active agent">
          {metrics.isStuck ? "⚠️" : "🤖"}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={taskUrl}
            className="text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent-blue)] truncate block"
            title={task.title}
          >
            {task.title}
          </Link>
        </div>
        <Link
          href={taskUrl}
          className="text-[var(--text-muted)] hover:text-[var(--accent-blue)] flex-shrink-0"
          title="Open task"
        >
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Metadata row: model · runtime · tokens */}
      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-[var(--text-muted)]">
        <span className="font-mono">{formatModelShort(metrics.model)}</span>
        <span>·</span>
        <span className="flex items-center gap-1" title="Runtime">
          <Clock className="h-3 w-3" />
          {metrics.runtime}
        </span>
        <span>·</span>
        <span className="font-mono" title="Token usage">
          {formatTokenCount(metrics.totalTokens)}
        </span>
        {metrics.contextPercent > 0 && (
          <span
            className={`${
              metrics.contextPercent > 80
                ? "text-red-400"
                : metrics.contextPercent > 50
                  ? "text-yellow-400"
                  : "text-green-400"
            }`}
            title="Context window usage"
          >
            ({metrics.contextPercent}%)
          </span>
        )}
      </div>

      {/* Last output / idle status */}
      <div className={`flex items-center gap-1.5 mt-1 text-xs ${idleColor}`}>
        <Activity className="h-3 w-3" />
        {metrics.isStuck ? (
          <>
            <AlertTriangle className="h-3 w-3" />
            <span>idle {metrics.lastOutput} — possibly stuck</span>
          </>
        ) : (
          <span>last output {metrics.lastOutput} ago</span>
        )}
      </div>

      {/* Status badge for error/cancelled states */}
      {(metrics.status === "completed" || metrics.status === "stale") && (
        <div className="mt-1.5">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 h-auto ${
              metrics.status === "stale"
                ? "border-red-500/30 text-red-400"
                : "border-amber-500/30 text-amber-400"
            }`}
          >
            {metrics.status === "stale" ? "Stale" : "Completed"}
          </Badge>
        </div>
      )}

      {/* Loading indicator when fetching session data */}
      {isSessionLoading && (
        <div className="mt-1 text-[10px] text-[var(--text-muted)]/50">
          Loading session data...
        </div>
      )}
    </div>
  )
}
