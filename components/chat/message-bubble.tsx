"use client"

import { useState, useMemo } from "react"
import type { ChatMessage, DeliveryStatus } from "@/lib/types"
import { formatDistanceToNow } from "date-fns"
import { MessageActions } from "./message-actions"
import { Avatar } from "@/components/ui/avatar"
import { MarkdownContent } from "./markdown-content"
import { Button } from "@/components/ui/button"
import { ExternalLink, ChevronDown, ChevronRight, Bot, Check, AlertCircle } from "lucide-react"
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
  prevMessage?: ChatMessage
  chatLayout?: 'slack' | 'imessage'
}

const AUTHOR_NAMES: Record<string, string> = {
  ada: "Ada",
  "kimi-coder": "Kimi",
  "sonnet-reviewer": "Sonnet",
  "haiku-triage": "Haiku",
  dan: "Dan",
}

/**
 * Delivery status indicator component.
 * Shows small status icons for user messages only.
 * - sent: single gray checkmark
 * - delivered: double gray checkmark
 * - processing: animated spinner/dots
 * - responded: double blue checkmark
 * - failed: red exclamation with retry affordance
 */
interface DeliveryStatusProps {
  status: DeliveryStatus | null | undefined
  isOwnMessage: boolean
  onRetry?: () => void
}

function DeliveryStatus({ status, isOwnMessage: _isOwnMessage, onRetry }: DeliveryStatusProps) {
  // Don't show anything for legacy messages or bot messages without status
  if (!status) return null

  const baseClasses = "inline-flex items-center gap-0.5 text-xs transition-colors duration-200"
  
  switch (status) {
    case 'sent':
      return (
        <span className={`${baseClasses} text-[var(--text-muted)]`} title="Sent">
          <Check className="h-3 w-3" />
        </span>
      )
    
    case 'delivered':
      return (
        <span className={`${baseClasses} text-[var(--text-muted)]`} title="Agent received your message">
          <Check className="h-3 w-3" />
          <Check className="h-3 w-3 -ml-1.5" />
        </span>
      )
    
    case 'processing':
      return (
        <span className={`${baseClasses} text-[var(--text-muted)]`} title="Agent is working on it">
          <Check className="h-3 w-3" />
          <Check className="h-3 w-3 -ml-1.5" />
        </span>
      )
    
    case 'responded':
      return (
        <span className={`${baseClasses} text-blue-500`} title="Response received">
          <Check className="h-3 w-3" />
          <Check className="h-3 w-3 -ml-1.5" />
        </span>
      )
    
    case 'failed':
      return (
        <button
          onClick={onRetry}
          className={`${baseClasses} text-red-500 hover:text-red-600 cursor-pointer`}
          title="Delivery failed. Click to retry."
        >
          <AlertCircle className="h-3 w-3" />
          <span className="text-[10px] ml-0.5">Failed</span>
        </button>
      )
    
    default:
      return null
  }
}

/**
 * Format generation time in human-readable format.
 * - Under 60s: "4.2s"
 * - Over 60s: "1m 12s"
 * Returns null if cannot calculate.
 */
function formatGenerationTime(ms: number): string | null {
  if (ms < 0) return null
  const seconds = ms / 1000
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }
  const mins = Math.floor(seconds / 60)
  const remainingSecs = Math.round(seconds % 60)
  return `${mins}m ${remainingSecs}s`
}

export function MessageBubble({
  message,
  isOwnMessage = false,
  showAuthor = true,
  onCreateTask,
  activeCrons = [],
  projectSlug: _projectSlug, // eslint-disable-line @typescript-eslint/no-unused-vars
  prevMessage,
  chatLayout = 'slack',
}: MessageBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const authorName = AUTHOR_NAMES[message.author] || message.author

  // Calculate generation time for assistant messages
  const generationTime = useMemo(() => {
    // Only show for assistant messages (not user, not system)
    const isAssistant = message.author === "ada" || 
                        message.author === "kimi-coder" || 
                        message.author === "sonnet-reviewer" || 
                        message.author === "haiku-triage" ||
                        message.is_automated === 1
    if (!isAssistant) return null
    
    // Need previous message to calculate
    if (!prevMessage) return null
    
    // Calculate time difference
    const diff = message.created_at - prevMessage.created_at
    return formatGenerationTime(diff)
  }, [message, prevMessage])

  // Check if this is an automated (cron/sub-agent) message
  const isAutomatedMessage = useMemo(() => {
    // Only check agent messages, not human messages
    if (message.author === "dan") {
      return false
    }
    
    // Primary detection: use is_automated flag from database
    if (message.is_automated === 1) {
      return true
    }
    
    // Fallback: content-based heuristics for older messages without the flag
    if (!message.run_id) {
      return false
    }
    
    const hasWorkLoopIndicators = message.content.toLowerCase().includes("cron:") ||
                                   message.content.toLowerCase().includes("work-loop") ||
                                   message.content.toLowerCase().includes("clutch-work-loop") ||
                                   (message.content.toLowerCase().includes("task:") && message.content.toLowerCase().includes("openclutch ticket"))

    return hasWorkLoopIndicators
  }, [message.content, message.run_id, message.author, message.is_automated])

  // Extract summary from automated message content
  const automatedSummary = useMemo(() => {
    if (!isAutomatedMessage) return null

    const content = message.content
    
    // Look for task completion patterns
    if (content.includes("## Task:")) {
      const taskMatch = content.match(/## Task: (.+?)(?:\n|$)/m)
      if (taskMatch) {
        return `Completed task: ${taskMatch[1]}`
      }
    }
    
    // Look for ticket ID patterns
    if (content.includes("OpenClutch ticket ID:")) {
      const ticketMatch = content.match(/OpenClutch ticket ID: `([^`]+)`/m)
      const taskMatch = content.match(/## Task: (.+?)(?:\n|$)/m)
      if (ticketMatch && taskMatch) {
        return `Automated: ${taskMatch[1]}`
      } else if (ticketMatch) {
        return `Automated task: ${ticketMatch[1].substring(0, 8)}...`
      }
    }

    // Look for PR creation patterns
    if (content.includes("PR created") || content.includes("Pull request")) {
      return "Created PR"
    }

    // Fallback - first line or first sentence
    const firstLine = content.split('\n')[0]?.trim()
    if (firstLine && firstLine.length > 0 && firstLine.length < 150) {
      return firstLine.startsWith("#") ? firstLine.replace(/^#+\s*/, "") : firstLine
    }

    return "Automated task completed"
  }, [isAutomatedMessage, message.content])

  // Try to find matching session key from active crons
  const sessionKey = useMemo(() => {
    if (!isAutomatedMessage || activeCrons.length === 0) return null
    
    // For now, use the most recent cron session
    // TODO: In the future we could try to match by run_id or other criteria
    const mostRecentCron = activeCrons.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]
    return mostRecentCron?.key
  }, [isAutomatedMessage, activeCrons])

  // If this is an automated message, render the collapsed view
  if (isAutomatedMessage && automatedSummary) {
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
              
              {/* Generation time */}
              {generationTime && (
                <span className="text-xs text-[var(--text-muted)] italic">
                  {generationTime}
                </span>
              )}
              
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
          <div className={`inline-block px-3 md:px-4 py-2 md:py-3 rounded-2xl text-sm md:text-base leading-normal font-normal border-l-4 border-blue-500 overflow-hidden max-w-full ${
            isOwnMessage
              ? "bg-[var(--accent-blue)] text-white rounded-br-md"
              : "bg-gradient-to-r from-blue-50/20 to-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-bl-md"
          }`}>
            {/* Summary row with toggle and session link */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <div className="font-medium text-sm text-blue-600 dark:text-blue-400 mb-1">
                  🤖 Automated
                </div>
                <div className="break-words">
                  {automatedSummary}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Session link */}
                {sessionKey && (
                  <Link 
                    href={`/sessions/${encodeURIComponent(sessionKey)}`}
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
      <div className={`flex-1 max-w-[90%] md:max-w-[80%] min-w-0 w-0 overflow-hidden ${isOwnMessage ? "text-right" : ""}`}>
        {/* Author + time + actions */}
        {showAuthor && (
          <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? "flex-row-reverse" : ""}`}>
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {authorName}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {formatDistanceToNow(message.created_at, { addSuffix: true })}
            </span>

            {/* Delivery status - inline for slack layout, human messages only */}
            {chatLayout === 'slack' && message.author !== 'ada' && (
              <DeliveryStatus
                status={message.delivery_status}
                isOwnMessage={isOwnMessage}
              />
            )}

            {/* Generation time */}
            {generationTime && (
              <span className="text-xs text-[var(--text-muted)] italic">
                {generationTime}
              </span>
            )}

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
          className={`block w-full px-3 md:px-4 py-2 md:py-3 rounded-2xl text-sm md:text-base leading-normal font-normal chat-text overflow-hidden min-w-0 ${
            isOwnMessage
              ? "bg-[var(--accent-blue)] text-white rounded-br-md"
              : "bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-bl-md"
          }`}
        >
          <MarkdownContent
            content={message.content}
            className="break-words min-w-0"
          />
        </div>

        {/* Delivery status - under bubble for imessage layout */}
        {chatLayout === 'imessage' && message.author !== 'ada' && (
          <div className="mt-1 text-right">
            <DeliveryStatus
              status={message.delivery_status}
              isOwnMessage={isOwnMessage}
            />
          </div>
        )}
      </div>
    </div>
  )
}
