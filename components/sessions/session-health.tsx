"use client"

import { formatDistanceToNow } from "date-fns"
import { Clock, Zap, AlertCircle, CheckCircle, XCircle, Loader2 } from "lucide-react"

interface SessionHealthProps {
  status: "working" | "idle" | "stuck" | "completed" | "failed"
  startedAt: number
  lastActivityAt: number
  tokensUsed?: number
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
    label: "Completed",
    iconClass: ""
  },
  failed: { 
    icon: XCircle, 
    color: "#ef4444", 
    label: "Failed",
    iconClass: ""
  },
}

export function SessionHealth({ status, startedAt, lastActivityAt, tokensUsed }: SessionHealthProps) {
  const config = STATUS_CONFIG[status]
  const StatusIcon = config.icon
  
  const elapsed = formatDistanceToNow(startedAt, { addSuffix: false })
  const lastActivity = formatDistanceToNow(lastActivityAt, { addSuffix: true })

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`
    }
    return tokens.toString()
  }

  return (
    <div className="flex items-center gap-4 flex-wrap text-sm">
      {/* Status */}
      <div className="flex items-center gap-2">
        <StatusIcon 
          className={`h-4 w-4 ${config.iconClass}`}
          style={{ color: config.color }}
        />
        <span style={{ color: config.color }} className="font-medium">
          {config.label}
        </span>
      </div>
      
      {/* Elapsed time */}
      <div className="flex items-center gap-1 text-[var(--text-secondary)]">
        <Clock className="h-3 w-3" />
        <span>{elapsed} elapsed</span>
      </div>
      
      {/* Tokens */}
      {tokensUsed !== undefined && (
        <div className="flex items-center gap-1 text-[var(--text-secondary)]">
          <Zap className="h-3 w-3" />
          <span>{formatTokens(tokensUsed)} tokens</span>
        </div>
      )}
      
      {/* Last activity */}
      {status !== "completed" && status !== "failed" && (
        <div className="text-[var(--text-muted)]">
          Last activity {lastActivity}
        </div>
      )}
    </div>
  )
}
