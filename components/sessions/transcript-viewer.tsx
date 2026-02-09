"use client"

import { useState } from "react"
import { MessageSquare, ChevronDown, ChevronUp } from "lucide-react"
import { TranscriptMessage } from "./transcript-message"

interface Message {
  role: "system" | "user" | "assistant"
  content: string
  timestamp?: number
  toolCalls?: Array<{
    tool: string
    params: Record<string, unknown>
    result?: string
    error?: string
  }>
}

interface TranscriptViewerProps {
  messages: Message[]
  agentName?: string
  loading?: boolean
}

export function TranscriptViewer({ messages, agentName, loading = false }: TranscriptViewerProps) {
  const [showSystem, setShowSystem] = useState(false)
  
  const systemMessages = messages.filter(m => m.role === "system")
  const conversationMessages = messages.filter(m => m.role !== "system")

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-[var(--text-muted)]">Loading transcript...</div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MessageSquare className="h-12 w-12 text-[var(--text-muted)] mb-4" />
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
          No transcript available
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          Transcript will appear here when the session has activity.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* System prompt (collapsible) */}
      {systemMessages.length > 0 && (
        <div>
          <button
            onClick={() => setShowSystem(!showSystem)}
            className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-2"
          >
            {showSystem ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            System prompt ({systemMessages.length})
          </button>
          
          {showSystem && (
            <div className="space-y-2 mb-4">
              {systemMessages.map((msg, i) => (
                <TranscriptMessage 
                  key={i} 
                  message={msg}
                  agentName={agentName}
                />
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Conversation */}
      <div className="space-y-4">
        {conversationMessages.map((msg, i) => (
          <TranscriptMessage 
            key={i} 
            message={msg}
            agentName={agentName}
          />
        ))}
      </div>
    </div>
  )
}
