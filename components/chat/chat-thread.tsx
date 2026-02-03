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
}

export function ChatThread({ 
  messages, 
  loading = false, 
  currentUser = "dan",
  onCreateTask,
}: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

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
      <div ref={bottomRef} />
    </div>
  )
}
