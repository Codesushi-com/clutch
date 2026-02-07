"use client"

import { useSessionStore } from "@/lib/stores/session-store"

interface ContextIndicatorProps {
  sessionKey?: string
  projectId?: string
}

export function ContextIndicator({
  sessionKey = "main",
}: ContextIndicatorProps) {
  // Get sessions from the global store (single source of truth)
  // SessionProvider in root layout handles the polling
  const sessions = useSessionStore((state) => state.sessions)
  const isLoading = useSessionStore((state) => state.isLoading)

  // Find the session matching our sessionKey
  const session = sessions.find(
    (s) => s.id === sessionKey
  ) || sessions.find(
    (s) => s.id.endsWith(sessionKey)
  )

  if (!session) {
    return null
  }

  const tokens = session.tokens.total
  const total = 200000 // Default context window estimate
  const percentage = total > 0 ? Math.round((tokens / total) * 100) : 0

  const formatTokens = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`
    }
    return num.toString()
  }

  const getProgressColor = (pct: number) => {
    if (pct < 50) return "bg-green-500"
    if (pct < 80) return "bg-yellow-500"
    return "bg-red-500"
  }

  const displayModel = session.model?.split("/").pop() || session.model

  return (
    <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
      <div className="flex items-center gap-2">
        <span>Context:</span>
        <span className="font-medium">
          {formatTokens(tokens)}/{formatTokens(total)} 
          ({Math.round(percentage)}%)
        </span>
        
        {/* Progress bar */}
        <div className="w-16 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${getProgressColor(percentage)}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        
        {isLoading && (
          <span className="text-[var(--text-muted)]/70">updating...</span>
        )}
      </div>
      
      {displayModel && (
        <span className="text-[var(--text-muted)]/70">
          {displayModel}
        </span>
      )}
    </div>
  )
}
