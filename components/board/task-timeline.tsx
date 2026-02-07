"use client"

import { useState } from "react"
import { 
  GitCommit, 
  User, 
  Bot, 
  MessageSquare, 
  CheckCircle2, 
  ArrowRight,
  Clock,
  ExternalLink,
  AlertCircle,
  RotateCcw
} from "lucide-react"
import type { Event, EventType } from "@/lib/types"

interface TaskTimelineProps {
  events: Event[] | null
  isLoading: boolean
  projectSlug: string
}

interface EventData {
  from_status?: string
  to_status?: string
  model?: string
  role?: string
  tokens_in?: number
  tokens_out?: number
  duration_ms?: number
  pr_number?: number
  pr_action?: string
  branch?: string
  reap_reason?: string
  error?: string
  comment_preview?: string
  session_key?: string
}

const EVENT_CONFIG: Record<EventType, { label: string; icon: React.ReactNode; color: string }> = {
  task_created: {
    label: "Task created",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "text-green-500",
  },
  task_moved: {
    label: "Status changed",
    icon: <ArrowRight className="h-4 w-4" />,
    color: "text-blue-500",
  },
  task_assigned: {
    label: "Assigned",
    icon: <User className="h-4 w-4" />,
    color: "text-purple-500",
  },
  task_completed: {
    label: "Completed",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "text-green-500",
  },
  comment_added: {
    label: "Comment",
    icon: <MessageSquare className="h-4 w-4" />,
    color: "text-gray-500",
  },
  agent_started: {
    label: "Agent started",
    icon: <Bot className="h-4 w-4" />,
    color: "text-cyan-500",
  },
  agent_completed: {
    label: "Agent completed",
    icon: <Bot className="h-4 w-4" />,
    color: "text-cyan-500",
  },
  chat_created: {
    label: "Chat created",
    icon: <MessageSquare className="h-4 w-4" />,
    color: "text-gray-500",
  },
  message_sent: {
    label: "Message sent",
    icon: <MessageSquare className="h-4 w-4" />,
    color: "text-gray-500",
  },
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (seconds < 60) return `${seconds}s ago`
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  
  return new Date(timestamp).toLocaleDateString()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function parseEventData(data: string | null): EventData {
  if (!data) return {}
  try {
    return JSON.parse(data) as EventData
  } catch {
    return {}
  }
}

function getSessionUrl(sessionKey: string, projectSlug: string): string {
  // Session key format: agent:main:trap:{role}:{taskShortId}
  // Link to project sessions page with the session key
  return `/projects/${projectSlug}/sessions/${encodeURIComponent(sessionKey)}`
}

function isAgentActor(actor: string): boolean {
  return actor.startsWith("agent:") || actor.includes("[bot]")
}

function formatActorName(actor: string): string {
  if (actor.startsWith("agent:")) {
    // agent:main:trap:role:taskId -> role agent
    const parts = actor.split(":")
    const role = parts[3] || "agent"
    return `Agent (${role})`
  }
  if (actor.includes("[bot]")) {
    return actor
  }
  return actor
}

export function TaskTimeline({ events, isLoading, projectSlug }: TaskTimelineProps) {
  const [showOldestFirst, setShowOldestFirst] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-[var(--text-muted)]">Loading history...</div>
      </div>
    )
  }

  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <GitCommit className="h-8 w-8 text-[var(--text-muted)] mb-3" />
        <p className="text-sm text-[var(--text-muted)]">No history yet</p>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          Events will appear here as the task progresses
        </p>
      </div>
    )
  }

  // Sort events based on user preference
  const sortedEvents = showOldestFirst 
    ? [...events].sort((a, b) => a.created_at - b.created_at)
    : events // Already sorted newest first from API

  return (
    <div className="space-y-4">
      {/* Sort toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowOldestFirst(!showOldestFirst)}
          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          {showOldestFirst ? "Show newest first" : "Show oldest first"}
        </button>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-[var(--border)]" />

        {/* Events */}
        <div className="space-y-0">
          {sortedEvents.map((event, index) => (
            <TimelineItem 
              key={event.id} 
              event={event} 
              projectSlug={projectSlug}
              isLast={index === sortedEvents.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface TimelineItemProps {
  event: Event
  projectSlug: string
  isLast: boolean
}

function TimelineItem({ event, projectSlug, isLast }: TimelineItemProps) {
  const config = EVENT_CONFIG[event.type]
  const data = parseEventData(event.data)
  
  // Extract session key from actor if it's an agent
  const sessionKey = event.actor.startsWith("agent:") ? event.actor : null

  return (
    <div className={`relative pl-10 pb-6 ${isLast ? '' : ''}`}>
      {/* Dot/icon */}
      <div 
        className={`absolute left-0 top-0 w-8 h-8 rounded-full bg-[var(--bg-primary)] border border-[var(--border)] flex items-center justify-center ${config.color}`}
      >
        {config.icon}
      </div>

      {/* Content */}
      <div className="pt-1">
        {/* Header line */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <EventTitle event={event} config={config} data={data} />
          </div>
          <time 
            className="text-xs text-[var(--text-muted)] whitespace-nowrap"
            title={new Date(event.created_at).toLocaleString()}
          >
            {formatRelativeTime(event.created_at)}
          </time>
        </div>

        {/* Details */}
        <div className="mt-1 space-y-1">
          <EventDetails 
            event={event} 
            data={data} 
            sessionKey={sessionKey}
            projectSlug={projectSlug}
          />
        </div>
      </div>
    </div>
  )
}

interface EventTitleProps {
  event: Event
  config: { label: string; icon: React.ReactNode; color: string }
  data: EventData
}

function EventTitle({ event, config, data }: EventTitleProps) {
  switch (event.type) {
    case "task_moved":
      if (data.from_status && data.to_status) {
        return (
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Status → <StatusBadge status={data.to_status} />
          </span>
        )
      }
      return <span className="text-sm font-medium text-[var(--text-primary)]">{config.label}</span>
    
    case "task_created":
      return <span className="text-sm font-medium text-[var(--text-primary)]">Task created</span>
    
    case "task_assigned":
      return (
        <span className="text-sm font-medium text-[var(--text-primary)]">
          Assigned to {data.role ? <span className="text-purple-400">{data.role}</span> : formatActorName(event.actor)}
        </span>
      )
    
    case "agent_started":
      return (
        <span className="text-sm font-medium text-[var(--text-primary)]">
          Agent assigned {data.role ? <span className="text-cyan-400">({data.role})</span> : null}
        </span>
      )
    
    case "agent_completed":
      if (data.reap_reason) {
        return (
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Agent <span className="text-red-400">reaped</span> ({data.reap_reason})
          </span>
        )
      }
      return <span className="text-sm font-medium text-[var(--text-primary)]">Agent completed</span>
    
    case "comment_added":
      return <span className="text-sm font-medium text-[var(--text-primary)]">Comment added</span>
    
    default:
      return <span className="text-sm font-medium text-[var(--text-primary)]">{config.label}</span>
  }
}

interface StatusBadgeProps {
  status: string
}

function StatusBadge({ status }: StatusBadgeProps) {
  const colors: Record<string, string> = {
    backlog: "text-gray-400",
    ready: "text-blue-400",
    in_progress: "text-yellow-400",
    in_review: "text-purple-400",
    done: "text-green-400",
  }
  
  const labels: Record<string, string> = {
    backlog: "Backlog",
    ready: "Ready",
    in_progress: "In Progress",
    in_review: "Review",
    done: "Done",
  }
  
  return <span className={colors[status] || "text-gray-400"}>{labels[status] || status}</span>
}

interface EventDetailsProps {
  event: Event
  data: EventData
  sessionKey: string | null
  projectSlug: string
}

function EventDetails({ event, data, sessionKey, projectSlug }: EventDetailsProps) {
  const actor = event.actor
  
  switch (event.type) {
    case "task_moved":
      return (
        <div className="text-xs text-[var(--text-secondary)] space-y-1">
          {data.from_status && (
            <div>From: <StatusBadge status={String(data.from_status)} /></div>
          )}
          <div>Moved by: <span className={isAgentActor(actor) ? "text-cyan-400" : ""}>{formatActorName(actor)}</span></div>
        </div>
      )
    
    case "task_created":
      return (
        <div className="text-xs text-[var(--text-secondary)]">
          By: <span className={isAgentActor(actor) ? "text-cyan-400" : ""}>{formatActorName(actor)}</span>
        </div>
      )
    
    case "agent_started":
    case "agent_completed":
      return (
        <AgentEventDetails
          data={data}
          sessionKey={sessionKey}
          projectSlug={projectSlug}
        />
      )
    
    case "task_assigned":
      if (data.session_key) {
        return (
          <div className="text-xs text-[var(--text-secondary)]">
            Session: <SessionLink sessionKey={String(data.session_key)} projectSlug={projectSlug} />
          </div>
        )
      }
      return null
    
    case "comment_added":
      if (data.comment_preview) {
        return (
          <div className="text-xs text-[var(--text-secondary)]">
            &ldquo;{String(data.comment_preview)}&rdquo;
          </div>
        )
      }
      return (
        <div className="text-xs text-[var(--text-secondary)]">
          By: <span className={isAgentActor(actor) ? "text-cyan-400" : ""}>{formatActorName(actor)}</span>
        </div>
      )
    
    default:
      return (
        <div className="text-xs text-[var(--text-secondary)]">
          By: <span className={isAgentActor(actor) ? "text-cyan-400" : ""}>{formatActorName(actor)}</span>
        </div>
      )
  }
}

interface AgentEventDetailsProps {
  data: EventData
  sessionKey: string | null
  projectSlug: string
}

function AgentEventDetails({ data, sessionKey, projectSlug }: AgentEventDetailsProps) {
  const effectiveSessionKey = sessionKey || data.session_key
  
  return (
    <div className="text-xs text-[var(--text-secondary)] space-y-1">
      {/* Session key with link */}
      {effectiveSessionKey && (
        <div className="flex items-center gap-2">
          <span>Session:</span>
          <SessionLink sessionKey={effectiveSessionKey} projectSlug={projectSlug} />
        </div>
      )}
      
      {/* Model info */}
      {data.model && (
        <div>Model: <span className="text-[var(--text-muted)]">{String(data.model)}</span></div>
      )}

      {/* Role */}
      {data.role && !effectiveSessionKey && (
        <div>Role: <span className="text-purple-400">{String(data.role)}</span></div>
      )}
      
      {/* Token usage */}
      {(data.tokens_in || data.tokens_out) && (
        <div>
          Tokens: {data.tokens_in ? formatTokenCount(data.tokens_in) : "-"} in / {data.tokens_out ? formatTokenCount(data.tokens_out) : "-"} out
        </div>
      )}
      
      {/* Duration */}
      {data.duration_ms && (
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Duration: {formatDuration(data.duration_ms)}
        </div>
      )}
      
      {/* Reap reason */}
      {data.reap_reason && (
        <div className="flex items-center gap-1 text-red-400">
          <AlertCircle className="h-3 w-3" />
          Reason: {String(data.reap_reason)}
        </div>
      )}
      
      {/* Error */}
      {data.error && (
        <div className="text-red-400">Error: {String(data.error)}</div>
      )}
    </div>
  )
}

interface SessionLinkProps {
  sessionKey: string
  projectSlug: string
}

function SessionLink({ sessionKey, projectSlug }: SessionLinkProps) {
  const url = getSessionUrl(sessionKey, projectSlug)
  const displayKey = sessionKey.length > 40 ? sessionKey.slice(0, 37) + "..." : sessionKey
  
  return (
    <a 
      href={url}
      className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors"
      title={sessionKey}
    >
      <span className="font-mono">{displayKey}</span>
      <ExternalLink className="h-3 w-3" />
    </a>
  )
}
