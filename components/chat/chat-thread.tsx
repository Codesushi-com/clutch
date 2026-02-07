"use client"

import { useEffect, useRef, useCallback } from "react"
import { MessageSquare } from "lucide-react"
import { MessageBubble } from "./message-bubble"
import { useChatStore } from "@/lib/stores/chat-store"
import type { ChatMessage } from "@/lib/types"

interface TypingIndicator {
  author: string
  state: "thinking" | "typing"
}

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

interface ChatThreadProps {
  chatId: string
  messages: ChatMessage[]
  loading?: boolean
  currentUser?: string
  onCreateTask?: (message: ChatMessage) => void
  typingIndicators?: TypingIndicator[]
  chatLayout?: 'slack' | 'imessage'
  activeCrons?: SubAgentDetails[]
  projectSlug?: string
}

export function ChatThread({
  chatId,
  messages,
  loading = false,
  currentUser = "dan",
  onCreateTask,
  typingIndicators = [],
  chatLayout = 'slack',
  activeCrons = [],
  projectSlug,
}: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { setScrollPosition, getScrollPosition } = useChatStore()
  const isAutoScrollingRef = useRef(false)
  // Track which chat we've already scrolled for (initial load vs new messages)
  const scrolledChatIdRef = useRef<string | null>(null)

  // Check if user is near bottom of chat (within 100px)
  const isNearBottom = useCallback(() => {
    if (!containerRef.current) return true
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    return scrollHeight - scrollTop - clientHeight < 100
  }, [])

  // Save scroll position to store (debounced to avoid excessive saves)
  const saveScrollPosition = useCallback(() => {
    if (!containerRef.current || isAutoScrollingRef.current) return

    const { scrollTop } = containerRef.current
    setScrollPosition(chatId, scrollTop)
  }, [chatId, setScrollPosition])

  // Handle scroll behavior on chat switch or initial load
  useEffect(() => {
    if (!containerRef.current) return

    // Only run when chatId changes (switching chats)
    if (scrolledChatIdRef.current === chatId) return

    // Mark this chat as scrolled so we don't re-run on message updates
    scrolledChatIdRef.current = chatId

    const savedPosition = getScrollPosition(chatId)

    // Use setTimeout to ensure DOM is updated with new messages
    setTimeout(() => {
      if (!containerRef.current) return

      if (savedPosition > 0) {
        // Restore saved scroll position (user was here before)
        isAutoScrollingRef.current = true
        containerRef.current.scrollTop = savedPosition
        setTimeout(() => {
          isAutoScrollingRef.current = false
        }, 100)
      } else {
        // First time viewing this chat - scroll to bottom instantly
        isAutoScrollingRef.current = true
        bottomRef.current?.scrollIntoView({ behavior: "instant" })
        setTimeout(() => {
          isAutoScrollingRef.current = false
        }, 100)
      }
    }, 50)
  }, [chatId, getScrollPosition])

  // Auto-scroll to bottom for new messages (only if user is already near bottom)
  useEffect(() => {
    // Skip if we haven't done initial scroll for this chat yet
    if (scrolledChatIdRef.current !== chatId) return

    // Only auto-scroll if user is near bottom (they haven't scrolled up to read history)
    if (isNearBottom()) {
      isAutoScrollingRef.current = true
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })

      // Clear auto-scroll flag after animation
      setTimeout(() => {
        isAutoScrollingRef.current = false
      }, 500)
    }
  }, [messages.length, typingIndicators.length, isNearBottom, chatId])

  // Set up scroll event listener for saving position
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let timeoutId: NodeJS.Timeout
    const handleScroll = () => {
      // Debounce scroll position saving
      clearTimeout(timeoutId)
      timeoutId = setTimeout(saveScrollPosition, 150)
    }

    container.addEventListener('scroll', handleScroll)
    return () => {
      container.removeEventListener('scroll', handleScroll)
      clearTimeout(timeoutId)
    }
  }, [saveScrollPosition])

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
    <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-4 space-y-3 md:space-y-4 min-w-0 max-w-full">
      {groupedMessages.map((group, groupIndex) => (
        <div key={groupIndex} className="space-y-1">
          {group.messages.map((message, msgIndex) => {
            // Determine if this is the user's own message based on layout
            const isOwnMessage = chatLayout === 'imessage' && message.author === currentUser
            
            return (
              <MessageBubble
                key={message.id}
                message={message}
                isOwnMessage={isOwnMessage}
                showAuthor={msgIndex === 0}
                onCreateTask={onCreateTask}
                activeCrons={activeCrons}
                projectSlug={projectSlug}
              />
            )
          })}
        </div>
      ))}
      
      {/* Typing indicator */}
      {typingIndicators.length > 0 && (
        <div className="flex items-center gap-2 px-2 md:px-4 py-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-sm text-[var(--text-muted)]">
            {typingIndicators.map((t) => t.author).join(", ")} {typingIndicators.length === 1 ? "is" : "are"} {typingIndicators[0]?.state === "thinking" ? "thinking..." : "typing..."}
          </span>
        </div>
      )}
      
      <div ref={bottomRef} />
    </div>
  )
}
