"use client"

import { useState } from "react"
import { Edit2, Check, X } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useChatStore, type ChatWithLastMessage } from "@/lib/stores/chat-store"
import { useSessionStore } from "@/lib/stores/session-store"

interface ChatHeaderProps {
  chat: ChatWithLastMessage
}

export function ChatHeader({ chat }: ChatHeaderProps) {
  const { updateChat } = useChatStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(chat.title)
  const [isUpdating, setIsUpdating] = useState(false)

  // Get sessions from the global store (single source of truth)
  // SessionProvider in root layout handles the polling
  const sessions = useSessionStore((state) => state.sessions)
  const loadingSession = useSessionStore((state) => state.isLoading)

  // Find session matching this chat's session_key
  const session = sessions.find(
    (s) => s.session_key === chat.session_key
  ) || sessions.find(
    (s) => s.session_key.endsWith(chat.session_key ?? "")
  )

  // Derive session info from Convex data
  const sessionInfo = (() => {
    if (!session) return null
    const tokens = session.tokens_total ?? 0
    const contextWindow = 200000
    const contextPercent = contextWindow > 0 ? Math.round((tokens / contextWindow) * 100) : 0
    return {
      model: session.model,
      contextPercent,
    }
  })()

  const handleStartEdit = () => {
    setIsEditing(true)
    setEditTitle(chat.title)
  }

  const handleSave = async () => {
    const newTitle = editTitle.trim()
    if (!newTitle || newTitle === chat.title) {
      setIsEditing(false)
      setEditTitle(chat.title)
      return
    }

    setIsUpdating(true)
    try {
      await updateChat(chat.id, { title: newTitle })
      setIsEditing(false)
    } catch (error) {
      console.error("Failed to update chat title:", error)
      // Reset to original title on error
      setEditTitle(chat.title)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditTitle(chat.title)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSave()
    } else if (e.key === "Escape") {
      e.preventDefault()
      handleCancel()
    }
  }

  return (
    <div className="py-1.5 px-2 md:p-4 flex items-center gap-2 md:gap-3">
      {isEditing ? (
        <>
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            disabled={isUpdating}
            className="flex-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded px-2 md:px-3 py-1.5 md:py-2 text-sm md:text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)] disabled:opacity-50 touch-manipulation"
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isUpdating || !editTitle.trim()}
            className="p-1.5 h-7 w-7 md:h-auto md:w-auto min-h-[36px] md:min-h-0 touch-manipulation"
          >
            <Check className="h-3.5 w-3.5 md:h-4 md:w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancel}
            disabled={isUpdating}
            className="p-1.5 h-7 w-7 md:h-auto md:w-auto min-h-[36px] md:min-h-0 touch-manipulation"
          >
            <X className="h-3.5 w-3.5 md:h-4 md:w-4" />
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 md:gap-2 flex-1 min-w-0">
            <h1 className="text-sm md:text-lg font-semibold text-[var(--text-primary)] truncate">
              {chat.title}
            </h1>
            {chat.session_key && sessionInfo && !loadingSession && (
              <Link href={`/sessions/${chat.session_key}`} className="hidden md:inline">
                <Badge variant="outline" className="cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors text-xs">
                  {sessionInfo.model} • {sessionInfo.contextPercent}%
                </Badge>
              </Link>
            )}
            {chat.session_key && loadingSession && (
              <Badge variant="outline" className="opacity-50 text-xs hidden md:inline">
                Loading...
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleStartEdit}
            className="p-1.5 h-7 w-7 md:h-auto md:w-auto hover:bg-[var(--bg-tertiary)] min-h-[36px] md:min-h-0 touch-manipulation"
          >
            <Edit2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
          </Button>
        </>
      )}
    </div>
  )
}
