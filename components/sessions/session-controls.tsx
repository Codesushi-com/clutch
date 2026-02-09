"use client"

import { useState } from "react"
import { Send, RefreshCw, Square, ExternalLink, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SessionHealth } from "./session-health"

interface SessionControlsProps {
  session: {
    id: string
    agent: string
    status: "working" | "idle" | "stuck" | "completed" | "failed"
    taskId?: string
    startedAt: number
    lastActivityAt: number
    tokensUsed?: number
  }
  onStop?: () => void
  onRestart?: () => void
  onSendMessage?: (message: string) => void
  onViewTask?: () => void
}

export function SessionControls({
  session,
  onStop,
  onRestart,
  onSendMessage,
  onViewTask,
}: SessionControlsProps) {
  const [showSendMessage, setShowSendMessage] = useState(false)
  const [message, setMessage] = useState("")
  const [showStopConfirm, setShowStopConfirm] = useState(false)
  const [sending, setSending] = useState(false)

  const isActive = session.status === "working" || session.status === "idle" || session.status === "stuck"

  const handleSend = async () => {
    if (!message.trim() || !onSendMessage) return
    
    setSending(true)
    try {
      await onSendMessage(message.trim())
      setMessage("")
      setShowSendMessage(false)
    } finally {
      setSending(false)
    }
  }

  const handleStop = () => {
    onStop?.()
    setShowStopConfirm(false)
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 space-y-4">
      {/* Health indicators */}
      <SessionHealth
        status={session.status}
        startedAt={session.startedAt}
        lastActivityAt={session.lastActivityAt}
        tokensUsed={session.tokensUsed}
      />
      
      {/* Control buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Send Message */}
        {isActive && onSendMessage && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSendMessage(true)}
          >
            <Send className="h-4 w-4 mr-2" />
            Send Message
          </Button>
        )}
        
        {/* Restart */}
        {onRestart && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRestart}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Restart
          </Button>
        )}
        
        {/* Stop */}
        {isActive && onStop && (
          <>
            {!showStopConfirm ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowStopConfirm(true)}
                className="text-red-500 hover:text-red-400 hover:border-red-500"
              >
                <Square className="h-4 w-4 mr-2" />
                Stop
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-500">Stop session?</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleStop}
                >
                  Confirm
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowStopConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </>
        )}
        
        {/* View Task */}
        {session.taskId && onViewTask && (
          <Button
            variant="outline"
            size="sm"
            onClick={onViewTask}
            className="ml-auto"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View Task
          </Button>
        )}
      </div>
      
      {/* Send Message Input */}
      {showSendMessage && (
        <div className="border-t border-[var(--border)] pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              Send Message to Session
            </span>
            <button
              onClick={() => setShowSendMessage(false)}
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            This will inject a message into the session as if from the coordinator.
          </p>
          <div className="flex gap-2">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              rows={2}
              className="flex-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)] resize-none"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  handleSend()
                }
              }}
            />
            <Button
              onClick={handleSend}
              disabled={!message.trim() || sending}
            >
              {sending ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
