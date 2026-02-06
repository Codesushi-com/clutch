"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, MessageSquare, Trash2, X, ChevronDown, ChevronRight, ListTodo, ExternalLink, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useChatStore, type ChatWithLastMessage } from "@/lib/stores/chat-store"
import { TaskModal } from "@/components/board/task-modal"
import { NewIssueDialog } from "@/components/chat/new-issue-dialog"
import type { Task } from "@/lib/types"

interface ChatSidebarProps {
  projectId: string
  projectSlug?: string
  isOpen?: boolean
  onClose?: () => void
  isMobile?: boolean
}

interface WorkQueueSection {
  label: string
  status: string
  tasks: Task[]
  expanded: boolean
}

const AUTHOR_COLORS: Record<string, string> = {
  ada: "#a855f7",
  "kimi-coder": "#3b82f6",
  "sonnet-reviewer": "#22c55e",
  "haiku-triage": "#eab308",
  dan: "#64748b",
}

const STATUS_COLORS: Record<string, string> = {
  in_review: "#a855f7",   // Purple for in review
  in_progress: "#3b82f6", // Blue for in progress
  ready: "#22c55e",       // Green for ready/up next
}

export function ChatSidebar({ projectId, projectSlug, isOpen = true, onClose, isMobile = false }: ChatSidebarProps) {
  const { chats, activeChat, setActiveChat, createChat, deleteChat, loading, fetchChats, currentProjectId } = useChatStore()
  const [creating, setCreating] = useState(false)
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null)
  
  // Work queue state
  const [workQueueSections, setWorkQueueSections] = useState<WorkQueueSection[]>([
    { label: "In Review", status: "in_review", tasks: [], expanded: true },
    { label: "In Progress", status: "in_progress", tasks: [], expanded: true },
    { label: "Up Next", status: "ready", tasks: [], expanded: true },
  ])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [readyCount, setReadyCount] = useState(0)
  
  // Recently shipped state
  const [recentlyShipped, setRecentlyShipped] = useState<Task[]>([])
  const [recentlyShippedExpanded, setRecentlyShippedExpanded] = useState(true)
  
  // Task modal state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  
  // New issue dialog state
  const [newIssueDialogOpen, setNewIssueDialogOpen] = useState(false)

  // Fetch work queue tasks
  const fetchWorkQueue = useCallback(async () => {
    try {
      // Fetch tasks for each status (including done for recently shipped)
      const [reviewRes, inProgressRes, readyRes, doneRes] = await Promise.all([
        fetch(`/api/tasks?projectId=${projectId}&status=in_review`),
        fetch(`/api/tasks?projectId=${projectId}&status=in_progress`),
        fetch(`/api/tasks?projectId=${projectId}&status=ready`),
        fetch(`/api/tasks?projectId=${projectId}&status=done&limit=3`),
      ])

      const [reviewData, inProgressData, readyData, doneData] = await Promise.all([
        reviewRes.json(),
        inProgressRes.json(),
        readyRes.json(),
        doneRes.json(),
      ])

      // Track full ready count for header display
      const fullReadyTasks = readyData.tasks || []
      setReadyCount(fullReadyTasks.length)

      setWorkQueueSections(prev => prev.map(section => {
        if (section.status === "in_review") {
          return { ...section, tasks: reviewData.tasks || [] }
        }
        if (section.status === "in_progress") {
          return { ...section, tasks: inProgressData.tasks || [] }
        }
        if (section.status === "ready") {
          // Only show top 2 ready tasks as "Up Next"
          return { ...section, tasks: fullReadyTasks.slice(0, 2) }
        }
        return section
      }))
      
      // Set recently shipped tasks
      setRecentlyShipped(doneData.tasks || [])
    } catch (error) {
      console.error("Failed to fetch work queue:", error)
    } finally {
      setLoadingTasks(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchWorkQueue()
    // Poll every 30 seconds for updates
    const interval = setInterval(fetchWorkQueue, 30000)
    return () => clearInterval(interval)
  }, [fetchWorkQueue])

  // Refetch chats when project changes
  useEffect(() => {
    if (projectId && currentProjectId !== projectId) {
      fetchChats(projectId)
    }
  }, [projectId, currentProjectId, fetchChats])

  const toggleSection = (status: string) => {
    setWorkQueueSections(prev => prev.map(section => 
      section.status === status 
        ? { ...section, expanded: !section.expanded }
        : section
    ))
  }

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
    setTaskModalOpen(true)
  }

  const handleTaskModalClose = (open: boolean) => {
    setTaskModalOpen(open)
    if (!open) {
      // Refresh work queue when modal closes to reflect any changes
      fetchWorkQueue()
    }
  }

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
    }
  }

  const handleChatSelect = (chat: ChatWithLastMessage) => {
    setActiveChat(chat)
    if (isMobile && onClose) {
      onClose()
    }
  }

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

  const formatShortId = (id: string) => {
    return `#${id.substring(0, 8)}`
  }

  const truncateTitle = (title: string, maxLength: number = 30) => {
    if (title.length <= maxLength) return title
    return title.substring(0, maxLength) + "..."
  }

  const formatRelativeTime = (timestamp: number | null) => {
    if (!timestamp) return "recently"
    
    const now = Date.now()
    const diffMs = now - timestamp
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffMinutes < 1) return "just now"
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return "yesterday"
    if (diffDays < 7) return `${diffDays}d ago`
    return new Date(timestamp).toLocaleDateString([], { month: "short", day: "numeric" })
  }

  const formatDuration = (timestamp: number | null) => {
    if (!timestamp) return ""
    
    const now = Date.now()
    const diffMs = now - timestamp
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    
    if (diffMinutes < 1) return "just started"
    if (diffMinutes < 60) return `${diffMinutes}m`
    if (diffHours < 24) {
      const remainingMinutes = diffMinutes % 60
      return remainingMinutes > 0 ? `${diffHours}h ${remainingMinutes}m` : `${diffHours}h`
    }
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    return `${diffDays}d`
  }

  // Mobile backdrop
  const backdrop = isMobile && isOpen && onClose && (
    <div 
      className="fixed inset-0 bg-black/50 z-40 lg:hidden"
      onClick={onClose}
    />
  )

  // Count total tasks in work queue (excluding sections with 0)
  const totalWorkItems = workQueueSections.reduce((sum, s) => sum + s.tasks.length, 0)

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
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(50vh - 100px)' }}>
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
                  <div 
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ backgroundColor: authorColor }}
                  />
                  
                  <button
                    onClick={() => handleChatSelect(chat)}
                    className="flex-1 text-left focus:outline-none min-h-[40px] touch-manipulation min-w-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-sm font-medium truncate ${
                          isActive ? "text-[var(--accent-blue)]" : "text-[var(--text-primary)]"
                        }`}>
                          {chat.title}
                        </span>
                      </div>
                      
                      {chat.lastMessage && (
                        <p className="text-xs text-[var(--text-muted)] truncate mt-0.5 max-w-full">
                          {chat.lastMessage.author}: {chat.lastMessage.content}
                        </p>
                      )}
                    </div>
                  </button>
                  
                  {chat.lastMessage && (
                    <div className="flex-shrink-0 text-xs text-[var(--text-muted)] pt-0.5">
                      {formatTime(chat.lastMessage.created_at)}
                    </div>
                  )}
                  
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
      
      {/* New chat and issue buttons */}
      <div className="p-2 border-b border-[var(--border)] space-y-2">
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => setNewIssueDialogOpen(true)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Issue
        </Button>
      </div>

      {/* Divider with Work Queue header */}
      <div className="p-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-[var(--text-muted)]" />
            <h2 className="font-medium text-[var(--text-primary)]">Work Queue</h2>
            {totalWorkItems > 0 && (
              <span className="text-xs bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] px-1.5 py-0.5 rounded">
                {totalWorkItems}
              </span>
            )}
            {readyCount > 0 && (
              <span className="text-xs bg-green-500/20 text-green-600 px-1.5 py-0.5 rounded font-medium">
                {readyCount} ready
              </span>
            )}
          </div>
          {projectSlug && (
            <Link 
              href={`/projects/${projectSlug}/board`}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1"
              title="Open board"
            >
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {/* Work Queue sections */}
      <div className="flex-1 overflow-y-auto">
        {loadingTasks ? (
          <div className="p-4 text-sm text-[var(--text-muted)]">Loading tasks...</div>
        ) : totalWorkItems === 0 ? (
          <div className="p-4 text-center">
            <ListTodo className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2" />
            <p className="text-sm text-[var(--text-muted)]">No active work</p>
          </div>
        ) : (
          workQueueSections.map((section) => {
            if (section.tasks.length === 0) return null
            
            return (
              <div key={section.status} className="border-b border-[var(--border)]">
                {/* Section header */}
                <button
                  onClick={() => toggleSection(section.status)}
                  className="w-full flex items-center gap-2 p-2 px-3 hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  {section.expanded ? (
                    <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-[var(--text-muted)]" />
                  )}
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    {section.label}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    ({section.tasks.length})
                  </span>
                </button>

                {/* Section tasks */}
                {section.expanded && (
                  <div className="pb-1">
                    {section.tasks.map((task) => {
                      const showId = section.status === "in_review"
                      const showDuration = section.status === "in_progress"
                      
                      return (
                        <button
                          key={task.id}
                          onClick={() => handleTaskClick(task)}
                          className="w-full flex items-start gap-2 px-3 py-2 hover:bg-[var(--bg-tertiary)] transition-colors group text-left"
                        >
                          <div 
                            className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                            style={{ backgroundColor: STATUS_COLORS[section.status] || "#52525b" }}
                          />
                          <div className="min-w-0 flex-1">
                            {showId && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-[var(--text-muted)]">
                                  {formatShortId(task.id)}
                                </span>
                              </div>
                            )}
                            <p className="text-xs text-[var(--text-primary)] group-hover:text-[var(--accent-blue)] truncate">
                              {truncateTitle(task.title)}
                            </p>
                            {showDuration && (
                              <span className="text-xs text-[var(--text-muted)]">
                                {formatDuration(task.updated_at)}
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
        
        {/* Recently Shipped section */}
        {recentlyShipped.length > 0 && (
          <>
            {/* Section header */}
            <div className="p-3 border-t border-[var(--border)] bg-[var(--bg-secondary)]/30">
              <button
                onClick={() => setRecentlyShippedExpanded(!recentlyShippedExpanded)}
                className="w-full flex items-center gap-2"
              >
                {recentlyShippedExpanded ? (
                  <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-[var(--text-muted)]" />
                )}
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="font-medium text-[var(--text-primary)] text-sm">Recently Shipped</span>
              </button>
            </div>
            
            {/* Recently shipped tasks */}
            {recentlyShippedExpanded && (
              <div className="border-b border-[var(--border)]">
                {recentlyShipped.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => handleTaskClick(task)}
                    className="w-full flex items-start gap-2 px-3 py-2 hover:bg-[var(--bg-tertiary)] transition-colors group text-left"
                  >
                    <CheckCircle2 className="h-3 w-3 text-green-500 mt-1 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[var(--text-primary)] group-hover:text-[var(--accent-blue)] truncate">
                        {truncateTitle(task.title)}
                      </p>
                      <span className="text-xs text-[var(--text-muted)]">
                        {formatRelativeTime(task.completed_at)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )

  return (
    <>
      {backdrop}
      {sidebarContent}
      <TaskModal
        task={selectedTask}
        open={taskModalOpen}
        onOpenChange={handleTaskModalClose}
      />
      <NewIssueDialog
        projectId={projectId}
        open={newIssueDialogOpen}
        onOpenChange={setNewIssueDialogOpen}
        onCreated={(taskId) => {
          // Refresh work queue to show the new task
          fetchWorkQueue()
          console.log("New issue created:", taskId)
        }}
      />
    </>
  )
}
