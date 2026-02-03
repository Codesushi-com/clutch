"use client"

import { useState } from "react"
import { Plus, MessageSquare } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"
import { useChatStore, type ChatWithLastMessage } from "@/lib/stores/chat-store"

interface ChatSidebarProps {
  projectId: string
}

const AUTHOR_COLORS: Record<string, string> = {
  ada: "#a855f7",
  "kimi-coder": "#3b82f6",
  "sonnet-reviewer": "#22c55e",
  "haiku-triage": "#eab308",
  dan: "#ef4444",
}

export function ChatSidebar({ projectId }: ChatSidebarProps) {
  const { chats, activeChat, setActiveChat, createChat, loading } = useChatStore()
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [showNewChat, setShowNewChat] = useState(false)

  const handleCreateChat = async () => {
    if (!newTitle.trim()) return
    
    setCreating(true)
    try {
      const chat = await createChat(projectId, newTitle.trim())
      setActiveChat({ ...chat, lastMessage: null })
      setNewTitle("")
      setShowNewChat(false)
    } finally {
      setCreating(false)
    }
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    } else if (diffDays === 1) {
      return "Yesterday"
    } else if (diffDays < 7) {
      return `${diffDays} days`
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" })
    }
  }

  return (
    <div className="w-64 border-r border-[var(--border)] flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-[var(--border)]">
        <h2 className="font-medium text-[var(--text-primary)]">Chats</h2>
      </div>
      
      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-[var(--text-muted)]">Loading...</div>
        ) : chats.length === 0 ? (
          <div className="p-4 text-center">
            <MessageSquare className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2" />
            <p className="text-sm text-[var(--text-muted)]">No chats yet</p>
          </div>
        ) : (
          chats.map((chat) => {
            const isActive = activeChat?.id === chat.id
            const authorColor = chat.lastMessage 
              ? AUTHOR_COLORS[chat.lastMessage.author] || "#52525b"
              : "#52525b"
            
            return (
              <button
                key={chat.id}
                onClick={() => setActiveChat(chat)}
                className={`w-full text-left p-3 border-b border-[var(--border)] transition-colors ${
                  isActive
                    ? "bg-[var(--accent-blue)]/10"
                    : "hover:bg-[var(--bg-tertiary)]"
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* Status dot */}
                  <div 
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ backgroundColor: authorColor }}
                  />
                  
                  <div className="flex-1 min-w-0">
                    {/* Title + time */}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-medium truncate ${
                        isActive ? "text-[var(--accent-blue)]" : "text-[var(--text-primary)]"
                      }`}>
                        {chat.title}
                      </span>
                      {chat.lastMessage && (
                        <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
                          {formatTime(chat.lastMessage.created_at)}
                        </span>
                      )}
                    </div>
                    
                    {/* Last message preview */}
                    {chat.lastMessage && (
                      <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                        {chat.lastMessage.author}: {chat.lastMessage.content}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
      
      {/* New chat */}
      <div className="p-2 border-t border-[var(--border)]">
        {showNewChat ? (
          <div className="space-y-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Chat title..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateChat()
                if (e.key === "Escape") {
                  setShowNewChat(false)
                  setNewTitle("")
                }
              }}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)]"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreateChat}
                disabled={creating || !newTitle.trim()}
                className="flex-1"
              >
                {creating ? "Creating..." : "Create"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowNewChat(false)
                  setNewTitle("")
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNewChat(true)}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        )}
      </div>
    </div>
  )
}
