"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "@/lib/hooks/use-session"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertCircle, RefreshCw, RotateCcw, Loader2, Activity } from "lucide-react"

type PipelineState = 
  | "idle"
  | "waiting"
  | "thinking"
  | "responding"
  | "slow"
  | "stuck"
  | "dead"

interface PipelineStatusProps {
  sessionKey: string
  lastSentAt: number | null
  isAssistantTyping: boolean
  onRetry: () => void
  onReset: () => void
}

export function PipelineStatus({
  sessionKey,
  lastSentAt,
  isAssistantTyping,
  onRetry,
  onReset,
}: PipelineStatusProps) {
  const { session } = useSession(sessionKey)
  const [now, setNow] = useState<number | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // Initialize time on mount and update every second
  useEffect(() => {
    // Schedule initial time set to avoid synchronous setState during render
    const timeout = setTimeout(() => setNow(Date.now()), 0)
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [])

  // Determine pipeline state
  const getState = useCallback((): PipelineState => {
    // No message sent or response already received
    if (!lastSentAt || !now) return "idle"

    const elapsedSinceSend = now - lastSentAt

    // Check if we got a response since send
    // (stop_reason is set means agent finished)
    if (session?.stop_reason && session.last_active_at && session.last_active_at > lastSentAt) {
      return "idle"
    }

    // If assistant is actively typing, show responding state
    if (isAssistantTyping) {
      return "responding"
    }

    // Check session activity
    const hasSessionActivity = session?.last_active_at && session.last_active_at > lastSentAt
    const sessionLastActive = session?.last_active_at || 0
    const timeSinceSessionActivity = now - sessionLastActive

    // Dead state: 120s+ total silence
    if (elapsedSinceSend > 120000) {
      return "dead"
    }

    // Stuck state: 60s+ with no session activity
    if (elapsedSinceSend > 60000 && (!hasSessionActivity || timeSinceSessionActivity > 60000)) {
      return "stuck"
    }

    // Slow state: 30s+ with session still active
    if (elapsedSinceSend > 30000 && hasSessionActivity) {
      return "slow"
    }

    // Thinking state: session activity detected
    if (hasSessionActivity) {
      return "thinking"
    }

    // Waiting state: message sent but no session activity yet
    if (elapsedSinceSend < 5000) {
      return "waiting"
    }

    // Default: still waiting but past initial 5s
    return "waiting"
  }, [lastSentAt, now, session, isAssistantTyping])

  const state = getState()

  // Don't show if idle or time not initialized
  if (state === "idle" || now === null) {
    return null
  }

  const elapsedSinceSend = lastSentAt ? Math.floor((now - lastSentAt) / 1000) : 0
  const elapsedDisplay = elapsedSinceSend > 0 ? `(${elapsedSinceSend}s)` : ""

  // State configurations
  const stateConfig = {
    waiting: {
      icon: <Loader2 className="h-4 w-4 animate-spin" />,
      text: "Waiting for agent...",
      className: "text-[var(--text-muted)]",
      showTimer: false,
      warning: false,
    },
    thinking: {
      icon: <Activity className="h-4 w-4 animate-pulse" />,
      text: `Agent thinking... ${elapsedDisplay}`,
      className: "text-[var(--accent-blue)]",
      showTimer: elapsedSinceSend > 15,
      warning: false,
    },
    responding: {
      icon: <Loader2 className="h-4 w-4 animate-spin" />,
      text: "Responding...",
      className: "text-[var(--accent-green)]",
      showTimer: false,
      warning: false,
    },
    slow: {
      icon: <AlertCircle className="h-4 w-4" />,
      text: `Still waiting... ${elapsedDisplay}`,
      className: "text-amber-500",
      showTimer: true,
      warning: true,
    },
    stuck: {
      icon: <AlertCircle className="h-4 w-4" />,
      text: `No activity for ${Math.floor((now - (session?.last_active_at || lastSentAt || now)) / 1000)}s — agent may be stuck`,
      className: "text-amber-500",
      showTimer: false,
      warning: true,
    },
    dead: {
      icon: <AlertCircle className="h-4 w-4" />,
      text: "No response for 2min",
      className: "text-red-500",
      showTimer: false,
      warning: true,
    },
  }

  const config = stateConfig[state]

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] mb-2">
        <span className={`flex items-center gap-2 text-sm ${config.className}`}>
          {config.icon}
          <span>{config.text}</span>
        </span>

        {/* Action buttons for stuck/dead states */}
        {(state === "stuck" || state === "dead") && (
          <div className="flex items-center gap-2 ml-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRetry}
                  className="h-7 px-2 text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Retry
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Re-send last message</p>
              </TooltipContent>
            </Tooltip>

            {state === "dead" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowResetConfirm(true)}
                    className="h-7 px-2 text-xs text-red-500 hover:text-red-600"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Reset Session
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset session (clears context)</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* Session info tooltip for stuck state */}
        {state === "stuck" && session && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
              >
                <Activity className="h-3.5 w-3.5" />
                Check
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1 text-xs">
                <p><strong>Session:</strong> {session.session_key}</p>
                <p><strong>Status:</strong> {session.status}</p>
                <p><strong>Model:</strong> {session.model || "Unknown"}</p>
                <p><strong>Last active:</strong> {session.last_active_at ? new Date(session.last_active_at).toLocaleTimeString() : "Never"}</p>
                <p><strong>Tokens:</strong> {session.tokens_total?.toLocaleString() || 0}</p>
                {session.output_preview && (
                  <p className="truncate max-w-[200px]"><strong>Last output:</strong> {session.output_preview}</p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Reset confirmation dialog */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset the session &quot;{sessionKey}&quot;. All conversation context will be cleared.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onReset()
                setShowResetConfirm(false)
              }}
              className="bg-red-500 hover:bg-red-600"
            >
              Reset Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
