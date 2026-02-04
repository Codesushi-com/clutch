"use client"

import { useEffect, useRef } from "react"
import { MessageSquare } from "lucide-react"
import { MessageBubble } from "./message-bubble"
import type { ChatMessage } from "@/lib/db/types"

interface ChatThreadProps {
  messages: ChatMessage[]
  loading?: boolean
  currentUser?: string
  onCreateTask?: (message: ChatMessage) => void
  typingAuthors?: string[]
}

export function ChatThread({ 
  messages, 
  loading = false, 
  currentUser = "dan",
  onCreateTask,
  typingAuthors = [],
}: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages or typing indicator
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length, typingAuthors.length])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-[var(--text-muted)]">Loading messages...</div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 mx-auto text-[var(--text-muted)] mb-3" />
          <p className="text-[var(--text-muted)]">No messages yet</p>
          <p className="text-sm text-[var(--text-muted)]">Start the conversation!</p>
        </div>
      </div>
    )
  }

  // Group consecutive messages by same author
  const groupedMessages: { author: string; messages: ChatMessage[] }[] = []
  messages.forEach((msg) => {
    const lastGroup = groupedMessages[groupedMessages.length - 1]
    if (lastGroup && lastGroup.author === msg.author) {
      lastGroup.messages.push(msg)
    } else {
      groupedMessages.push({ author: msg.author, messages: [msg] })
    }
  })

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {groupedMessages.map((group, groupIndex) => (
        <div key={groupIndex} className="space-y-1">
          {group.messages.map((message, msgIndex) => (
            <MessageBubble
              key={message.id}
              message={message}
              isOwnMessage={message.author === currentUser}
              showAuthor={msgIndex === 0}
              onCreateTask={onCreateTask}
            />
          ))}
        </div>
      ))}
      
      {/* Typing indicator */}
      {typingAuthors.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-sm text-[var(--text-muted)]">
            {typingAuthors.join(", ")} {typingAuthors.length === 1 ? "is" : "are"} typing...
          </span>
        </div>
      )}
      
      <div ref={bottomRef} />
    </div>
  )
}
