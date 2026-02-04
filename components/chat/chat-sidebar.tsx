"use client"

import { useState, useEffect } from "react"
import { Plus, MessageSquare, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useChatStore, type ChatWithLastMessage } from "@/lib/stores/chat-store"

interface ChatSidebarProps {
  projectId: string
  isOpen?: boolean
  onClose?: () => void
  isMobile?: boolean
}

const AUTHOR_COLORS: Record<string, string> = {
  ada: "#a855f7",
  "kimi-coder": "#3b82f6",
  "sonnet-reviewer": "#22c55e",
  "haiku-triage": "#eab308",
  dan: "#ef4444",
}

export function ChatSidebar({ projectId, isOpen = true, onClose, isMobile = false }: ChatSidebarProps) {
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

  const handleChatSelect = (chat: ChatWithLastMessage) => {
    setActiveChat(chat)
    // Close sidebar on mobile after selection
    if (isMobile && onClose) {
      onClose()
    }
  }

  // Close sidebar on escape key (mobile)
  useEffect(() => {
    if (!isMobile || !isOpen) return
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose()
      }
    }
    
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isMobile, isOpen, onClose])

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

  // Mobile backdrop
  const backdrop = isMobile && isOpen && onClose && (
    <div 
      className="fixed inset-0 bg-black/50 z-40 lg:hidden"
      onClick={onClose}
    />
  )

  const sidebarContent = (
    <div className={`
      flex flex-col h-full
      ${isMobile 
        ? `fixed top-0 left-0 z-50 w-80 max-w-[85vw] bg-[var(--bg-primary)] border-r border-[var(--border)] transform transition-transform duration-300 ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:relative lg:w-64 lg:transform-none lg:transition-none lg:z-auto`
        : 'w-64 border-r border-[var(--border)]'
      }
    `}>
      {/* Header */}
      <div className="p-3 border-b border-[var(--border)]">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-[var(--text-primary)]">Chats</h2>
          {isMobile && onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="p-1 h-auto lg:hidden"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
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
                <div className="flex items-start gap-2 p-3">
                  {/* Status dot */}
                  <div 
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ backgroundColor: authorColor }}
                  />
                  
                  {/* Main chat area - clickable */}
                  <button
                    onClick={() => handleChatSelect(chat)}
                    className="flex-1 text-left focus:outline-none min-h-[40px] touch-manipulation min-w-0"
                  >
                    <div className="min-w-0">
                      {/* Title */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-sm font-medium truncate ${
                          isActive ? "text-[var(--accent-blue)]" : "text-[var(--text-primary)]"
                        }`}>
                          {chat.title}
                        </span>
                      </div>
                      
                      {/* Last message preview */}
                      {chat.lastMessage && (
                        <p className="text-xs text-[var(--text-muted)] truncate mt-0.5 max-w-full">
                          {chat.lastMessage.author}: {chat.lastMessage.content}
                        </p>
                      )}
                    </div>
                  </button>
                  
                  {/* Timestamp - always visible */}
                  {chat.lastMessage && (
                    <div className="flex-shrink-0 text-xs text-[var(--text-muted)] pt-0.5">
                      {formatTime(chat.lastMessage.created_at)}
                    </div>
                  )}
                  
                  {/* Delete area - always visible */}
                  <div className="flex-shrink-0 flex items-center">
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
                        <span className="text-xs text-red-500 mr-2 whitespace-nowrap">Delete?</span>
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

  return (
    <>
      {backdrop}
      {sidebarContent}
    </>
  )
}
