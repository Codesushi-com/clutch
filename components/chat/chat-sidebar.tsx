"use client"

import { useState } from "react"
import { Plus, MessageSquare, Trash2 } from "lucide-react"
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
  const { chats, activeChat, setActiveChat, createChat, deleteChat, loading } = useChatStore()
  const [creating, setCreating] = useState(false)
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null)

  const handleCreateChat = async () => {
    setCreating(true)
    try {
      const chat = await createChat(projectId)
      setActiveChat({ ...chat, lastMessage: null })
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteChat = async (chatId: string) => {
    try {
      await deleteChat(chatId)
      setDeletingChatId(null)
    } catch (error) {
      console.error("Failed to delete chat:", error)
      // Could add error toast here if there's a toast system
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
            const isDeleting = deletingChatId === chat.id
            
            return (
              <div
                key={chat.id}
                className={`border-b border-[var(--border)] transition-colors ${
                  isActive
                    ? "bg-[var(--accent-blue)]/10"
                    : "hover:bg-[var(--bg-tertiary)]"
                }`}
              >
                <div className="flex items-start">
                  {/* Main chat area - clickable */}
                  <button
                    onClick={() => setActiveChat(chat)}
                    className="flex-1 text-left p-3 focus:outline-none"
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
                  
                  {/* Delete area */}
                  <div className="p-2 flex items-center">
                    {!isDeleting ? (
                      <button
                        onClick={() => setDeletingChatId(chat.id)}
                        className="p-1 text-[var(--text-muted)] hover:text-red-500 transition-colors"
                        title="Delete chat"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-500 mr-2">Delete?</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteChat(chat.id)}
                          className="h-6 px-2 text-xs"
                        >
                          Yes
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDeletingChatId(null)}
                          className="h-6 px-2 text-xs"
                        >
                          No
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
      
      {/* New chat */}
      <div className="p-2 border-t border-[var(--border)]">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreateChat}
          disabled={creating}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          {creating ? "Creating..." : "New Chat"}
        </Button>
      </div>
    </div>
  )
}
