"use client"

import { useState, useEffect } from "react"
import { Edit2, Check, X } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useChatStore, type ChatWithLastMessage } from "@/lib/stores/chat-store"
import { useOpenClawRpc } from "@/lib/hooks/use-openclaw-rpc"

interface ChatHeaderProps {
  chat: ChatWithLastMessage
}

interface SessionInfo {
  model?: string
  contextPercent?: number
}

export function ChatHeader({ chat }: ChatHeaderProps) {
  const { updateChat } = useChatStore()
  const { connected: rpcConnected, getSessionPreview } = useOpenClawRpc()
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(chat.title)
  const [isUpdating, setIsUpdating] = useState(false)
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const [loadingSession, setLoadingSession] = useState(false)

  // Fetch session info when chat has session_key and RPC is connected
  useEffect(() => {
    async function fetchSessionInfo() {
      if (!chat.session_key || !rpcConnected) {
        setSessionInfo(null)
        return
      }

      setLoadingSession(true)
      try {
        const preview = await getSessionPreview(chat.session_key)
        setSessionInfo({
          model: preview.session.model,
          contextPercent: Math.round(preview.contextPercentage),
        })
      } catch (error) {
        console.error("[ChatHeader] Failed to fetch session info:", error)
        setSessionInfo(null)
      } finally {
        setLoadingSession(false)
      }
    }

    fetchSessionInfo()
  }, [chat.session_key, rpcConnected, getSessionPreview])

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
    <div className="border-b border-[var(--border)] p-4 flex items-center gap-3">
      {isEditing ? (
        <>
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            disabled={isUpdating}
            className="flex-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)] disabled:opacity-50"
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isUpdating || !editTitle.trim()}
            className="p-1 h-8 w-8"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancel}
            disabled={isUpdating}
            className="p-1 h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-[var(--text-primary)] truncate">
              {chat.title}
            </h1>
            {chat.session_key && sessionInfo && !loadingSession && (
              <Link href={`/sessions/${chat.session_key}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors">
                  {sessionInfo.model} • {sessionInfo.contextPercent}%
                </Badge>
              </Link>
            )}
            {chat.session_key && loadingSession && (
              <Badge variant="outline" className="opacity-50">
                Loading...
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleStartEdit}
            className="p-1 h-8 w-8 hover:bg-[var(--bg-tertiary)]"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  )
}