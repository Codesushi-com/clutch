"use client"

import { formatDistanceToNow } from "date-fns"
import { Avatar } from "@/components/ui/avatar"
import { MarkdownContent } from "./markdown-content"

interface StreamingMessageProps {
  author: string
  content: string
  timestamp: number
  isOwnMessage?: boolean
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

export function StreamingMessage({ 
  author, 
  content, 
  timestamp, 
  isOwnMessage = false,
}: StreamingMessageProps) {
  const authorColor = AUTHOR_COLORS[author] || "#52525b"
  const authorName = AUTHOR_NAMES[author] || author

  return (
    <div className={`group flex gap-3 ${isOwnMessage ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <Avatar author={author} />
      
      {/* Message content */}
      <div className={`flex-1 max-w-[90%] md:max-w-[80%] ${isOwnMessage ? "text-right" : ""}`}>
        {/* Author + time */}
        <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? "flex-row-reverse" : ""}`}>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {authorName}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {formatDistanceToNow(timestamp, { addSuffix: true })}
          </span>
          <span className="text-xs text-[var(--accent-blue)] animate-pulse">
            streaming...
          </span>
        </div>
        
        {/* Bubble with streaming content */}
        <div 
          className={`inline-block px-3 md:px-4 py-2 md:py-3 rounded-2xl text-sm md:text-base ${
            isOwnMessage
              ? "bg-[var(--accent-blue)] text-white rounded-br-md"
              : "bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-bl-md"
          }`}
        >
          <div className="break-words">
            <MarkdownContent content={content} />
            <span className="inline-block w-2 h-4 bg-current ml-1 animate-pulse opacity-70">
              |
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}