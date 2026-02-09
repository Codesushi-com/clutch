"use client"

import { formatDistanceToNow } from "date-fns"
import { Clock, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react"

interface SessionCardProps {
  session: {
    id: string
    agent: string
    status: "working" | "idle" | "stuck" | "completed" | "failed"
    taskId?: string
    taskTitle?: string
    description?: string
    startedAt: number
    updatedAt: number
  }
  onClick?: () => void
}

const STATUS_CONFIG = {
  working: { 
    icon: Loader2, 
    color: "#22c55e", 
    label: "Working",
    iconClass: "animate-spin"
  },
  idle: { 
    icon: Clock, 
    color: "#eab308", 
    label: "Idle",
    iconClass: ""
  },
  stuck: { 
    icon: AlertCircle, 
    color: "#ef4444", 
    label: "Stuck",
    iconClass: ""
  },
  completed: { 
    icon: CheckCircle, 
    color: "#52525b", 
    label: "Done",
    iconClass: ""
  },
  failed: { 
    icon: XCircle, 
    color: "#ef4444", 
    label: "Failed",
    iconClass: ""
  },
}

const AGENT_COLORS: Record<string, string> = {
  ada: "#a855f7",
  "kimi-coder": "#3b82f6",
  "sonnet-reviewer": "#22c55e",
  "haiku-triage": "#eab308",
}

const AGENT_NAMES: Record<string, string> = {
  ada: "Ada",
  "kimi-coder": "Kimi",
  "sonnet-reviewer": "Sonnet",
  "haiku-triage": "Haiku",
}

export function SessionCard({ session, onClick }: SessionCardProps) {
  const config = STATUS_CONFIG[session.status]
  const StatusIcon = config.icon
  const agentColor = AGENT_COLORS[session.agent] || "#52525b"
  const agentName = AGENT_NAMES[session.agent] || session.agent

  return (
    <div 
      onClick={onClick}
      className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent-blue)] transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Status + Agent */}
        <div className="flex items-center gap-3">
          {/* Status icon */}
          <div 
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${config.color}20` }}
          >
            <StatusIcon 
              className={`h-4 w-4 ${config.iconClass}`}
              style={{ color: config.color }}
            />
          </div>
          
          {/* Agent info */}
          <div>
            <div className="flex items-center gap-2">
              <span 
                className="px-2 py-0.5 rounded text-xs font-medium text-white"
                style={{ backgroundColor: agentColor }}
              >
                {agentName}
              </span>
              <span 
                className="text-xs font-medium"
                style={{ color: config.color }}
              >
                {config.label}
              </span>
            </div>
            
            {session.description && (
              <p className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-1">
                {session.description}
              </p>
            )}
          </div>
        </div>
        
        {/* Right: Task + Time */}
        <div className="text-right flex-shrink-0">
          {session.taskTitle && (
            <div className="text-sm text-[var(--text-primary)]">
              Task #{session.taskId?.slice(0, 8)}
            </div>
          )}
          <div className="text-xs text-[var(--text-muted)]">
            {formatDistanceToNow(session.updatedAt, { addSuffix: true })}
          </div>
        </div>
      </div>
    </div>
  )
}
