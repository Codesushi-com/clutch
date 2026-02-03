"use client"

import { formatDistanceToNow } from "date-fns"
import { ToolCallBlock } from "./tool-call-block"

interface TranscriptMessageProps {
  message: {
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
  agentName?: string
}

const ROLE_CONFIG = {
  system: {
    label: "System",
    bgColor: "bg-[var(--bg-tertiary)]",
    borderColor: "border-[var(--text-muted)]",
  },
  user: {
    label: "User",
    bgColor: "bg-[var(--accent-blue)]/10",
    borderColor: "border-[var(--accent-blue)]",
  },
  assistant: {
    label: "Assistant",
    bgColor: "bg-[var(--bg-secondary)]",
    borderColor: "border-[var(--accent-purple)]",
  },
}

export function TranscriptMessage({ message, agentName }: TranscriptMessageProps) {
  const config = ROLE_CONFIG[message.role]
  const displayName = message.role === "assistant" && agentName ? agentName : config.label

  // Parse content for code blocks
  const renderContent = (content: string) => {
    // Split by code blocks
    const parts = content.split(/(```[\s\S]*?```)/g)
    
    return parts.map((part, i) => {
      if (part.startsWith("```")) {
        // Extract language and code
        const match = part.match(/```(\w+)?\n?([\s\S]*?)```/)
        if (match) {
          const lang = match[1] || ""
          const code = match[2].trim()
          return (
            <pre 
              key={i}
              className="my-2 p-3 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg overflow-x-auto text-sm"
            >
              {lang && (
                <div className="text-xs text-[var(--text-muted)] mb-2">
                  {lang}
                </div>
              )}
              <code className="text-[var(--text-primary)]">{code}</code>
            </pre>
          )
        }
      }
      
      // Regular text - preserve newlines
      return (
        <span key={i} className="whitespace-pre-wrap">
          {part}
        </span>
      )
    })
  }

  return (
    <div className={`rounded-lg border-l-4 ${config.bgColor} ${config.borderColor} p-4`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {message.role === "assistant" ? "🤖 " : ""}{displayName}
        </span>
        {message.timestamp && (
          <span className="text-xs text-[var(--text-muted)]">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
      
      {/* Content */}
      <div className="text-sm text-[var(--text-primary)]">
        {renderContent(message.content)}
      </div>
      
      {/* Tool calls */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mt-3">
          {message.toolCalls.map((toolCall, i) => (
            <ToolCallBlock
              key={i}
              tool={toolCall.tool}
              params={toolCall.params}
              result={toolCall.result}
              error={toolCall.error}
            />
          ))}
        </div>
      )}
    </div>
  )
}
