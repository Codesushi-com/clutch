"use client"

import { useState, useMemo } from "react"
import type { ChatMessage } from "@/lib/db/types"
import { formatDistanceToNow } from "date-fns"
import { MessageActions } from "./message-actions"
import { Avatar } from "@/components/ui/avatar"
import { MarkdownContent } from "./markdown-content"
import { Button } from "@/components/ui/button"
import { ExternalLink, ChevronDown, ChevronRight, Bot } from "lucide-react"
import Link from "next/link"

interface SubAgentDetails {
  key: string
  label?: string
  model?: string
  status?: string
  agentId?: string
  createdAt?: number
  updatedAt?: number
  runtime?: string
  isCron?: boolean
}

interface MessageBubbleProps {
  message: ChatMessage
  isOwnMessage?: boolean
  showAuthor?: boolean
  onCreateTask?: (message: ChatMessage) => void
  activeCrons?: SubAgentDetails[]
  projectSlug?: string
}

const AUTHOR_COLORS: Record<string, string> = {
  ada: "#a855f7",
  "kimi-coder": "#3b82f6",
  "sonnet-reviewer": "#22c55e",
  "haiku-triage": "#eab308",
  dan: "#ef4444",
}

const AUTHOR_NAMES: Record<string, string> = {
  ada: "Ada",
  "kimi-coder": "Kimi",
  "sonnet-reviewer": "Sonnet",
  "haiku-triage": "Haiku",
  dan: "Dan",
}

export function MessageBubble({ 
  message, 
  isOwnMessage = false, 
  showAuthor = true,
  onCreateTask,
  activeCrons = [],
  projectSlug,
}: MessageBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const authorColor = AUTHOR_COLORS[message.author] || "#52525b"
  const authorName = AUTHOR_NAMES[message.author] || message.author

  // Check if this is a work-loop agent message
  const isWorkLoopMessage = useMemo(() => {
    // Only check agent messages, not human messages
    if (!message.run_id || message.author === "dan") {
      return false
    }
    
    // Look for patterns indicating this is from a cron/work-loop agent
    // Check if message contains work-loop indicators
    const hasWorkLoopIndicators = message.content.toLowerCase().includes("cron:") ||
                                   message.content.toLowerCase().includes("work-loop") ||
                                   message.content.toLowerCase().includes("trap-work-loop") ||
                                   message.content.toLowerCase().includes("task:") && message.content.toLowerCase().includes("trap ticket")

    // Also check if we have active cron sessions that might match
    const hasActiveCron = activeCrons.length > 0

    return hasWorkLoopIndicators || hasActiveCron
  }, [message.content, message.run_id, message.author, activeCrons.length])

  // Extract summary from work-loop message content
  const workLoopSummary = useMemo(() => {
    if (!isWorkLoopMessage) return null

    const content = message.content
    
    // Look for task completion patterns
    if (content.includes("## Task:")) {
      const taskMatch = content.match(/## Task: (.+?)(?:\n|$)/m)
      if (taskMatch) {
        return `Completed task: ${taskMatch[1]}`
      }
    }
    
    // Look for ticket ID patterns
    if (content.includes("Trap ticket ID:")) {
      const ticketMatch = content.match(/Trap ticket ID: `([^`]+)`/m)
      const taskMatch = content.match(/## Task: (.+?)(?:\n|$)/m)
      if (ticketMatch && taskMatch) {
        return `Work loop completed: ${taskMatch[1]}`
      } else if (ticketMatch) {
        return `Work loop completed ticket: ${ticketMatch[1].substring(0, 8)}...`
      }
    }

    // Look for PR creation patterns
    if (content.includes("PR created") || content.includes("Pull request")) {
      return "Created PR for work loop task"
    }

    // Fallback - first line or first sentence
    const firstLine = content.split('\n')[0]?.trim()
    if (firstLine && firstLine.length > 0 && firstLine.length < 150) {
      return firstLine.startsWith("#") ? firstLine.replace(/^#+\s*/, "") : firstLine
    }

    return "Completed work loop task"
  }, [isWorkLoopMessage, message.content])

  // Try to find matching session key from active crons
  const sessionKey = useMemo(() => {
    if (!isWorkLoopMessage || activeCrons.length === 0) return null
    
    // For now, use the most recent cron session
    // TODO: In the future we could try to match by run_id or other criteria
    const mostRecentCron = activeCrons.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]
    return mostRecentCron?.key
  }, [isWorkLoopMessage, activeCrons])

  // If this is a work-loop message, render the collapsed view
  if (isWorkLoopMessage && workLoopSummary) {
    return (
      <div className={`group flex gap-3 ${isOwnMessage ? "flex-row-reverse" : ""}`}>
        {/* Avatar */}
        {showAuthor && <Avatar author={message.author} />}
        {!showAuthor && <div className="w-8 flex-shrink-0" />}
        
        {/* Message content */}
        <div className={`flex-1 max-w-[90%] md:max-w-[80%] ${isOwnMessage ? "text-right" : ""}`}>
          {/* Author + time + actions */}
          {showAuthor && (
            <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? "flex-row-reverse" : ""}`}>
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {authorName}
              </span>
              <Bot className="h-3 w-3 text-[var(--text-muted)]" />
              <span className="text-xs text-[var(--text-muted)]">Work Loop</span>
              <span className="text-xs text-[var(--text-muted)]">
                {formatDistanceToNow(message.created_at, { addSuffix: true })}
              </span>
              
              {/* Actions */}
              {onCreateTask && (
                <MessageActions 
                  message={message} 
                  onCreateTask={onCreateTask}
                />
              )}
            </div>
          )}
          
          {/* Collapsible work-loop bubble */}
          <div className={`inline-block px-3 md:px-4 py-2 md:py-3 rounded-2xl text-base leading-relaxed font-medium border-l-4 border-blue-500 ${
            isOwnMessage
              ? "bg-[var(--accent-blue)] text-white rounded-br-md"
              : "bg-gradient-to-r from-blue-50/20 to-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-bl-md"
          }`}>
            {/* Summary row with toggle and session link */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <div className="font-medium text-sm text-blue-600 dark:text-blue-400 mb-1">
                  🤖 Automated Work Loop
                </div>
                <div className="break-words">
                  {workLoopSummary}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Session link */}
                {sessionKey && projectSlug && (
                  <Link 
                    href={`/projects/${projectSlug}/sessions/${encodeURIComponent(sessionKey)}`}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Details
                  </Link>
                )}
                {/* Expand/collapse toggle */}
                <Button
                  variant="ghost" 
                  size="sm"
                  className="h-6 w-6 p-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-[var(--border-color)]/20">
                <MarkdownContent 
                  content={message.content}
                  className="break-words text-sm"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Regular message display
  return (
    <div className={`group flex gap-3 ${isOwnMessage ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      {showAuthor && <Avatar author={message.author} />}
      {!showAuthor && <div className="w-8 flex-shrink-0" />}
      
      {/* Message content */}
      <div className={`flex-1 max-w-[90%] md:max-w-[80%] ${isOwnMessage ? "text-right" : ""}`}>
        {/* Author + time + actions */}
        {showAuthor && (
          <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? "flex-row-reverse" : ""}`}>
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {authorName}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {formatDistanceToNow(message.created_at, { addSuffix: true })}
            </span>
            
            {/* Actions */}
            {onCreateTask && (
              <MessageActions 
                message={message} 
                onCreateTask={onCreateTask}
              />
            )}
          </div>
        )}
        
        {/* Bubble */}
        <div 
          className={`inline-block px-3 md:px-4 py-2 md:py-3 rounded-2xl text-base leading-relaxed font-medium chat-text ${
            isOwnMessage
              ? "bg-[var(--accent-blue)] text-white rounded-br-md"
              : "bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-bl-md"
          }`}
        >
          <MarkdownContent 
            content={message.content}
            className="break-words"
          />
        </div>
      </div>
    </div>
  )
}
