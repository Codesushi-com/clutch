"use client"

import { useState } from "react"
import { Edit2, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useChatStore, type ChatWithLastMessage } from "@/lib/stores/chat-store"

interface ChatHeaderProps {
  chat: ChatWithLastMessage
}

export function ChatHeader({ chat }: ChatHeaderProps) {
  const { updateChat } = useChatStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(chat.title)
  const [isUpdating, setIsUpdating] = useState(false)

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
          <h1 className="flex-1 text-lg font-semibold text-[var(--text-primary)] truncate">
            {chat.title}
          </h1>
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