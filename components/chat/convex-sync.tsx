"use client"

import { useEffect, useRef } from "react"
import { useConvexMessages, useConvexChats, useConvexTyping } from "@/lib/hooks/use-convex-messages"
import { useChatStore } from "@/lib/stores/chat-store"
import type { ChatWithLastMessage } from "@/lib/stores/chat-store"

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
  const { messages } = useConvexMessages(chatId)
  const { chats } = useConvexChats(projectId)
  const { typingState } = useConvexTyping(chatId)
  const syncMessages = useChatStore((s) => s.syncMessages)
  const syncChats = useChatStore((s) => s.syncChats)
  const syncTyping = useChatStore((s) => s.syncTyping)

  // Track previous values to avoid unnecessary syncs
  const prevMessagesRef = useRef<typeof messages>(null)
  const prevChatsRef = useRef<typeof chats>(null)
  const prevTypingRef = useRef<typeof typingState>(null)

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

  return null
}
