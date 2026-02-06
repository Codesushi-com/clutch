"use client"

import { useState, useEffect } from "react"
import { Bot, AlertTriangle } from "lucide-react"
import type { Task } from "@/lib/types"

interface AgentStatusProps {
  task: Task
  variant?: "compact" | "full"
  showIcon?: boolean
  className?: string
}

/**
 * Format model name to short form (e.g., "moonshot/kimi-for-coding" -> "kimi")
 */
export function formatModelShort(model: string | null | undefined): string {
  if (!model) return "agent"
  
  // Extract the part after the last slash
  const parts = model.split("/")
  const name = parts[parts.length - 1] || model
  
  // Remove common suffixes and extract short name
  const cleaned = name
    .replace(/-for-coding$/, "")
    .replace(/-thinking$/, "")
    .replace(/-preview$/, "")
    .replace(/-\d{4}-\d{2}$/, "") // Remove version dates like -2025-03

  // Shorten common names
  if (cleaned.includes('kimi')) return 'kimi'
  if (cleaned.includes('claude')) return 'claude'
  if (cleaned.includes('opus')) return 'opus'
  if (cleaned.includes('sonnet')) return 'sonnet'
  if (cleaned.includes('haiku')) return 'haiku'
  if (cleaned.includes('gpt')) return 'gpt'
  if (cleaned.includes('gemini')) return 'gemini'

  return cleaned.slice(0, 8)
}

/**
 * Format duration from timestamp to human readable string
 */
export function formatDuration(timestamp: number | null | undefined): string {
  if (!timestamp) return ""

  const now = Date.now()
  const diffMs = now - timestamp
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

/**
 * Format relative time for last activity
 */
export function formatLastActivity(timestamp: number | null | undefined): string {
  if (!timestamp) return "no activity"
  
  const now = Date.now()
  const diffMs = now - timestamp
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  
  if (diffMinutes < 1) return "just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return `${diffDays}d ago`
}

/**
 * Check if agent is stale (>5min no activity)
 */
export function isAgentStale(lastActiveAt: number | null | undefined): boolean {
  if (!lastActiveAt) return true
  const fiveMinutes = 5 * 60 * 1000
  return Date.now() - lastActiveAt > fiveMinutes
}

/**
 * Get color for model based on freshness
 */
function getModelColor(stale: boolean): string {
  return stale ? "#f59e0b" : "#22c55e" // amber-500 vs green-500
}

/**
 * Shared AgentStatus component
 * 
 * Displays agent role, model, duration, and last activity.
 * Used in both chat sidebar and board task cards.
 */
export function AgentStatus({ 
  task, 
  variant = "compact", 
  showIcon = true,
  className = ""
}: AgentStatusProps) {
  // Track current time for live updates - the state triggers re-renders for live time display
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_now, setNow] = useState(() => Date.now())

  // Update time every 10 seconds for live display
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  const hasAgent = !!task.agent_session_key
  
  // Don't render if no agent
  if (!hasAgent) return null

  const stale = isAgentStale(task.agent_last_active_at)
  const modelColor = getModelColor(stale)

  if (variant === "compact") {
    // Compact variant for sidebar (single line)
    return (
      <div className={`flex items-center gap-1 mt-0.5 ${className}`}>
        {showIcon && (
          <span className="text-xs" title={stale ? "Agent stale" : "Agent active"}>
            {stale ? "⚠" : "🤖"}
          </span>
        )}
        <span className={`text-xs ${stale ? "text-amber-500" : "text-[var(--text-muted)]"}`}>
          {task.role || "agent"}
          {task.agent_model && (
            <>
              {" · "}
              <span style={{ color: modelColor }}>
                {formatModelShort(task.agent_model)}
              </span>
            </>
          )}
          {task.agent_started_at && (
            <>
              {" · "}
              {formatDuration(task.agent_started_at)}
            </>
          )}
          <>
            {" · "}
            {stale
              ? `stale (no activity ${formatLastActivity(task.agent_last_active_at).replace(" ago", "")})`
              : `↻ ${formatLastActivity(task.agent_last_active_at)}`
            }
          </>
        </span>
      </div>
    )
  }

  // Full variant for board cards
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {showIcon && (
        <Bot 
          className={`h-3 w-3 ${stale ? "text-amber-500" : "text-[var(--text-muted)]"}`}
        />
      )}
      <span className="font-medium text-[var(--text-secondary)]">
        {formatModelShort(task.agent_model)}
      </span>
      {task.agent_last_active_at && (
        <span 
          className="font-medium"
          style={{ color: modelColor }}
          title="Time since last token output"
        >
          · {formatDuration(task.agent_last_active_at)}
        </span>
      )}
    </div>
  )
}

/**
 * Orphaned task warning component
 * Shows when an in_progress/in_review task has no agent attached
 */
export function OrphanedTaskWarning({ task }: { task: Task }) {
  // Track current time for live updates
  const [now, setNow] = useState(() => Date.now())

  // Update time every 30 seconds for live display
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const hasAgent = !!task.agent_session_key
  
  // Only show for in_progress or in_review without agent
  if (hasAgent || (task.status !== "in_progress" && task.status !== "in_review")) {
    return null
  }

  const ORPHAN_GRACE_MS = 30 * 60 * 1000
  const taskAge = task.updated_at ? now - task.updated_at : Infinity
  
  // Only show after grace period
  if (taskAge <= ORPHAN_GRACE_MS) return null

  return (
    <div 
      className="flex items-center gap-1 ml-2 text-amber-500"
      title="No agent attached to this in-progress task"
    >
      <AlertTriangle className="h-3 w-3" />
      <span className="text-xs">no agent</span>
    </div>
  )
}
