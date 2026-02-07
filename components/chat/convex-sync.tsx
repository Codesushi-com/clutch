"use client"

import { useEffect, useRef } from "react"
import { useMutation } from "convex/react"
import { useConvexMessages, useConvexChats, useConvexTyping } from "@/lib/hooks/use-convex-messages"
import { useChatStore } from "@/lib/stores/chat-store"
import type { ChatWithLastMessage } from "@/lib/stores/chat-store"
import { api } from "@/convex/_generated/api"

/**
 * Bridge between Convex reactive queries and the zustand chat store.
 *
 * Subscribes to Convex for real-time message, chat list, and typing updates,
 * then syncs them into the zustand store so existing UI components
 * work without modification.
 *
 * This component renders nothing — it's purely a data synchronization layer.
 */
export function ConvexChatSync({
  chatId,
  projectId,
}: {
  chatId: string | null
  projectId: string | null
}) {
  const { messages, hasMore } = useConvexMessages(chatId)
  const { chats } = useConvexChats(projectId)
  const { typingState } = useConvexTyping(chatId)
  const syncMessages = useChatStore((s) => s.syncMessages)
  const syncChats = useChatStore((s) => s.syncChats)
  const syncTyping = useChatStore((s) => s.syncTyping)
  const syncHasMoreMessages = useChatStore((s) => s.syncHasMoreMessages)

  // Mutation for clearing stale typing states
  const clearStaleTyping = useMutation(api.chats.clearStaleTyping)

  // Track previous values to avoid unnecessary syncs
  const prevMessagesRef = useRef<typeof messages>(null)
  const prevChatsRef = useRef<typeof chats>(null)
  const prevTypingRef = useRef<typeof typingState>(null)
  const prevHasMoreRef = useRef<typeof hasMore>(null)

  // Sync messages when Convex data changes
  useEffect(() => {
    if (!chatId || !messages) return
    // Only sync if the data actually changed (referential check)
    if (messages === prevMessagesRef.current) return
    prevMessagesRef.current = messages
    syncMessages(chatId, messages)
  }, [chatId, messages, syncMessages])

  // Sync chat list when Convex data changes
  useEffect(() => {
    if (!chats) return
    if (chats === prevChatsRef.current) return
    prevChatsRef.current = chats
    syncChats(chats as ChatWithLastMessage[])
  }, [chats, syncChats])

  // Sync typing state when Convex data changes
  useEffect(() => {
    if (!chatId || !typingState) return
    if (typingState === prevTypingRef.current) return
    prevTypingRef.current = typingState
    syncTyping(chatId, typingState.map((t) => ({ author: t.author, state: t.state })))
  }, [chatId, typingState, syncTyping])

  // Sync hasMore state when Convex data changes
  useEffect(() => {
    if (!chatId) return
    if (hasMore === prevHasMoreRef.current) return
    prevHasMoreRef.current = hasMore
    syncHasMoreMessages(chatId, hasMore)
  }, [chatId, hasMore, syncHasMoreMessages])

  // Periodic cleanup of stale typing states (every 30 seconds)
  // This is a safety net in case the plugin fails to clear typing
  useEffect(() => {
    const interval = setInterval(() => {
      clearStaleTyping()
    }, 30000)
    return () => clearInterval(interval)
  }, [clearStaleTyping])

  return null
}
