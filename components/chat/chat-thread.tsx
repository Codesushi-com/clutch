"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { MessageSquare, Loader2 } from "lucide-react"
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
  hasMore?: boolean
}

// Threshold in pixels for considering the user "at the bottom"
const BOTTOM_THRESHOLD = 50
// Threshold in pixels from top to trigger loading more messages
const TOP_THRESHOLD = 100

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
  hasMore = false,
}: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { setScrollPosition, getScrollPosition, loadMoreMessages } = useChatStore()
  const isAutoScrollingRef = useRef(false)
  const hasScrolledUpRef = useRef(false)
  const prevMessagesLengthRef = useRef(messages.length)
  const prevTypingIndicatorsLengthRef = useRef(typingIndicators.length)
  const isLoadingMoreRef = useRef(false)
  
  // Local state for loading more indicator
  const [loadingMore, setLoadingMore] = useState(false)
  
  // Unused refs removed — scroll tracking handled by scrolledForChatRef

  // Check if user is near bottom of chat (within threshold)
  const isNearBottom = useCallback(() => {
    if (!containerRef.current) return true
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    return scrollHeight - scrollTop - clientHeight < BOTTOM_THRESHOLD
  }, [])

  // Save scroll position to store (debounced to avoid excessive saves)
  const saveScrollPosition = useCallback(() => {
    if (!containerRef.current || isAutoScrollingRef.current) return
    const { scrollTop } = containerRef.current
    setScrollPosition(chatId, scrollTop)
  }, [chatId, setScrollPosition])

  // Handle scroll events to track if user has scrolled up
  const handleScroll = useCallback(() => {
    if (!containerRef.current || isAutoScrollingRef.current) return
    const nearBottom = isNearBottom()
    hasScrolledUpRef.current = !nearBottom
    saveScrollPosition()
  }, [isNearBottom, saveScrollPosition])

  // Handle scroll to load more messages when near top
  const handleScrollUp = useCallback(async () => {
    if (!containerRef.current || loadingMore || isLoadingMoreRef.current || !hasMore) return
    
    const { scrollTop } = containerRef.current
    if (scrollTop < TOP_THRESHOLD) {
      isLoadingMoreRef.current = true
      setLoadingMore(true)
      
      // Save current scroll height before loading
      const prevScrollHeight = containerRef.current.scrollHeight
      
      try {
        await loadMoreMessages(chatId)
        
        // Restore scroll position after messages are prepended
        requestAnimationFrame(() => {
          if (containerRef.current) {
            const newScrollHeight = containerRef.current.scrollHeight
            const heightDiff = newScrollHeight - prevScrollHeight
            containerRef.current.scrollTop = scrollTop + heightDiff
          }
        })
      } finally {
        setLoadingMore(false)
        isLoadingMoreRef.current = false
      }
    }
  }, [chatId, loadingMore, hasMore, loadMoreMessages])

  // Track which chatId we last scrolled for, so we only auto-scroll
  // once per chat switch (not on every message update)
  const scrolledForChatRef = useRef<string | null>(null)

  // Reset scroll state when switching chats
  useEffect(() => {
    hasScrolledUpRef.current = false
    prevMessagesLengthRef.current = 0
    scrolledForChatRef.current = null
  }, [chatId])

  // Scroll to correct position once Convex data has loaded for this chat.
  // `loading` is driven by Convex's useQuery (undefined = loading, value = loaded),
  // so we know conclusively when messages are ready.
  useEffect(() => {
    if (loading) return
    if (scrolledForChatRef.current === chatId) return
    if (!containerRef.current) return

    scrolledForChatRef.current = chatId
    const savedPosition = getScrollPosition(chatId)

    requestAnimationFrame(() => {
      if (!containerRef.current) return

      if (savedPosition > 0) {
        isAutoScrollingRef.current = true
        containerRef.current.scrollTop = savedPosition
        hasScrolledUpRef.current = !isNearBottom()
        setTimeout(() => { isAutoScrollingRef.current = false }, 100)
      } else {
        isAutoScrollingRef.current = true
        bottomRef.current?.scrollIntoView({ behavior: "instant" })
        hasScrolledUpRef.current = false
        setTimeout(() => { isAutoScrollingRef.current = false }, 100)
      }

      prevMessagesLengthRef.current = messages.length
    })
  }, [chatId, loading, messages.length, getScrollPosition, isNearBottom])

  // Auto-scroll on new messages or typing indicators (only if user is at bottom)
  useEffect(() => {
    const messagesChanged = messages.length !== prevMessagesLengthRef.current
    const typingChanged = typingIndicators.length !== prevTypingIndicatorsLengthRef.current

    // Update refs for next comparison
    prevMessagesLengthRef.current = messages.length
    prevTypingIndicatorsLengthRef.current = typingIndicators.length

    // Only scroll if something actually changed and user hasn't scrolled up
    if ((messagesChanged || typingChanged) && !hasScrolledUpRef.current) {
      isAutoScrollingRef.current = true
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
      hasScrolledUpRef.current = false

      // Clear auto-scroll flag after animation
      setTimeout(() => {
        isAutoScrollingRef.current = false
      }, 500)
    }
  }, [messages.length, typingIndicators.length])

  // MutationObserver to catch streaming content changes
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new MutationObserver(() => {
      // Only process if we're not currently auto-scrolling and user hasn't scrolled up
      if (isAutoScrollingRef.current) return
      if (hasScrolledUpRef.current) return

      // Scroll to bottom on any content change
      isAutoScrollingRef.current = true
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })

      // Clear auto-scroll flag after animation
      setTimeout(() => {
        isAutoScrollingRef.current = false
      }, 500)
    })

    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return () => observer.disconnect()
  }, [])

  // Set up scroll event listener for saving position, tracking scroll state, and loading more
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let debounceTimeout: NodeJS.Timeout
    const onScroll = () => {
      clearTimeout(debounceTimeout)
      debounceTimeout = setTimeout(() => {
        handleScroll()
        handleScrollUp()
      }, 50)
    }

    container.addEventListener('scroll', onScroll)
    return () => {
      container.removeEventListener('scroll', onScroll)
      clearTimeout(debounceTimeout)
    }
  }, [handleScroll, handleScrollUp])

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

  // Filter out system messages (e.g., "Response cancelled by user", "Session reset...")
  const visibleMessages = messages.filter((msg) => msg.author !== "system")

  // Group consecutive messages by same author
  const groupedMessages: { author: string; messages: ChatMessage[] }[] = []
  visibleMessages.forEach((msg) => {
    const lastGroup = groupedMessages[groupedMessages.length - 1]
    if (lastGroup && lastGroup.author === msg.author) {
      lastGroup.messages.push(msg)
    } else {
      groupedMessages.push({ author: msg.author, messages: [msg] })
    }
  })

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-4 space-y-3 md:space-y-4 min-w-0 max-w-full">
      {/* Loading indicator at top */}
      {loadingMore && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 text-[var(--text-muted)] animate-spin" />
          <span className="ml-2 text-sm text-[var(--text-muted)]">Loading older messages...</span>
        </div>
      )}
      
      {/* End of messages indicator */}
      {!hasMore && messages.length > 0 && (
        <div className="flex items-center justify-center py-2">
          <span className="text-xs text-[var(--text-muted)]">Beginning of conversation</span>
        </div>
      )}
      
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
