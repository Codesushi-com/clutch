"use client"

import type { ChatMessage } from "@/lib/db/types"
import { formatDistanceToNow } from "date-fns"
import { MessageActions } from "./message-actions"

interface MessageBubbleProps {
  message: ChatMessage
  isOwnMessage?: boolean
  showAuthor?: boolean
  onCreateTask?: (message: ChatMessage) => void
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
}: MessageBubbleProps) {
  const authorColor = AUTHOR_COLORS[message.author] || "#52525b"
  const authorName = AUTHOR_NAMES[message.author] || message.author

  return (
    <div className={`group flex gap-3 ${isOwnMessage ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      {showAuthor && (
        <div 
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
          style={{ backgroundColor: authorColor }}
        >
          {message.author.charAt(0).toUpperCase()}
        </div>
      )}
      {!showAuthor && <div className="w-8 flex-shrink-0" />}
      
      {/* Message content */}
      <div className={`flex-1 max-w-[80%] ${isOwnMessage ? "text-right" : ""}`}>
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
          className={`inline-block px-4 py-2 rounded-2xl ${
            isOwnMessage
              ? "bg-[var(--accent-blue)] text-white rounded-br-md"
              : "bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-bl-md"
          }`}
        >
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>
      </div>
    </div>
  )
}
