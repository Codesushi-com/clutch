"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Plus, MessageSquare, Trash2, X, ChevronDown, ChevronRight, ListTodo, ExternalLink, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useChatStore, type ChatWithLastMessage } from "@/lib/stores/chat-store"
import { TaskModal } from "@/components/board/task-modal"
import { NewIssueDialog } from "@/components/chat/new-issue-dialog"
import { useConvexTasks } from "@/lib/hooks/use-convex-tasks"
import { AgentStatus, formatDuration } from "@/components/agents/agent-status"
import { AgentCard } from "@/components/agents/agent-card"
import { useSessions } from "@/lib/hooks/use-sessions"
import { useActiveAgentSessions } from "@/lib/hooks/use-work-loop"
import type { Task } from "@/lib/types"

interface ChatSidebarProps {
  projectId: string | null
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
  const { chats, activeChat, setActiveChat, createChat, deleteChat, loading: chatsLoading, fetchChats, currentProjectId } = useChatStore()
  const [creating, setCreating] = useState(false)
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null)

  // Reactive Convex subscription for all project tasks - updates in real-time
  // when tasks are created, updated, moved, or deleted
  const { tasks: allTasks, isLoading: loadingTasks } = useConvexTasks(projectId ?? "")

  // Reactive Convex subscription for blocked tasks - separate query for sidebar widget
  const { tasks: blockedTasks } = useConvexTasks(projectId ?? "", "blocked")

  // Reactive Convex subscription for active agent tasks + their sessions.
  // Uses getWithActiveAgentSessions which joins tasks → sessions via agent_session_key.
  // This is more reliable than filtering the sessions table by type/project.
  const { data: activeAgentData } = useActiveAgentSessions(projectId)

  // Extract active tasks (in_progress or in_review with agent)
  const activeAgentTasks = useMemo(() => {
    if (!activeAgentData) return []
    return activeAgentData
      .filter(
        (d) =>
          d.task.status === "in_progress" || d.task.status === "in_review"
      )
      .map((d) => d.task)
  }, [activeAgentData])

  // Create lookup map: task_id -> session from the joined data
  const sessionByTaskId = useMemo(() => {
    const map = new Map()
    if (!activeAgentData) return map
    for (const d of activeAgentData) {
      if (d.session) {
        map.set(d.task.id, d.session)
      }
    }
    return map
  }, [activeAgentData])

  // Also subscribe to sessions for the work queue AgentStatus components
  const { sessions: agentSessions } = useSessions(
    { projectSlug: projectSlug || undefined },
    100
  )

  // Lookup: session_key -> session for work queue items
  const sessionByKey = useMemo(() => {
    const map = new Map()
    if (!agentSessions) return map
    for (const s of agentSessions) {
      map.set(s.session_key, s)
    }
    return map
  }, [agentSessions])

  // Section expansion state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    in_review: true,
    in_progress: true,
    ready: true,
  })

  // Recently shipped state
  const [recentlyShippedExpanded, setRecentlyShippedExpanded] = useState(true)

  // Active agents section expanded state (persisted in localStorage)
  const [activeAgentsExpanded, setActiveAgentsExpanded] = useState(true)

  // Load active agents expanded state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('clutch:activeAgentsExpanded')
    if (stored !== null) {
      setActiveAgentsExpanded(stored === 'true')
    }
  }, [])

  // Persist active agents expanded state to localStorage
  useEffect(() => {
    localStorage.setItem('clutch:activeAgentsExpanded', String(activeAgentsExpanded))
  }, [activeAgentsExpanded])

  // Blocked tasks section expanded state (persisted in localStorage)
  const [blockedExpanded, setBlockedExpanded] = useState(true)

  // Load blocked expanded state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('clutch:blockedExpanded')
    if (stored !== null) {
      setBlockedExpanded(stored === 'true')
    }
  }, [])

  // Persist blocked expanded state to localStorage
  useEffect(() => {
    localStorage.setItem('clutch:blockedExpanded', String(blockedExpanded))
  }, [blockedExpanded])

  // Work Queue section expanded state (persisted in localStorage)
  const [workQueueExpanded, setWorkQueueExpanded] = useState(true)

  // Load work queue expanded state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('clutch:workQueueExpanded')
    if (stored !== null) {
      setWorkQueueExpanded(stored === 'true')
    }
  }, [])

  // Persist work queue expanded state to localStorage
  useEffect(() => {
    localStorage.setItem('clutch:workQueueExpanded', String(workQueueExpanded))
  }, [workQueueExpanded])

  // Task modal state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)

  // New issue dialog state
  const [newIssueDialogOpen, setNewIssueDialogOpen] = useState(false)

  // Derive work queue sections from reactive task data
  const workQueueSections = useMemo<WorkQueueSection[]>(() => {
    if (!allTasks) return [
      { label: "In Review", status: "in_review", tasks: [], expanded: true },
      { label: "In Progress", status: "in_progress", tasks: [], expanded: true },
      { label: "Up Next", status: "ready", tasks: [], expanded: true },
    ]

    const inReview = allTasks.filter(t => t.status === "in_review")
    const inProgress = allTasks.filter(t => t.status === "in_progress")
    const ready = allTasks.filter(t => t.status === "ready")

    return [
      { label: "In Review", status: "in_review", tasks: inReview, expanded: expandedSections.in_review },
      { label: "In Progress", status: "in_progress", tasks: inProgress, expanded: expandedSections.in_progress },
      { label: "Up Next", status: "ready", tasks: ready.slice(0, 2), expanded: expandedSections.ready },
    ]
  }, [allTasks, expandedSections])

  // Derive ready count and recently shipped from reactive data
  const readyCount = useMemo(() => {
    if (!allTasks) return 0
    return allTasks.filter(t => t.status === "ready").length
  }, [allTasks])

  const recentlyShipped = useMemo(() => {
    if (!allTasks) return []
    return allTasks
      .filter(t => t.status === "done")
      .sort((a, b) => {
        const aTime = a.completed_at ?? a.updated_at
        const bTime = b.completed_at ?? b.updated_at
        return bTime - aTime
      })
      .slice(0, 3)
  }, [allTasks])

  // Refetch chats when project changes
  useEffect(() => {
    if (projectId && currentProjectId !== projectId) {
      fetchChats(projectId)
    }
  }, [projectId, currentProjectId, fetchChats])

  // Determine loading state - either projectId is null or data is loading
  const isLoading = !projectId || chatsLoading

  const toggleSection = (status: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [status]: !prev[status],
    }))
  }

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
    setTaskModalOpen(true)
  }

  const handleTaskModalClose = useCallback((open: boolean) => {
    setTaskModalOpen(open)
    // No need to refresh - Convex reactive subscription updates automatically
  }, [])

  const handleCreateChat = async () => {
    if (!projectId) return
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
        {isLoading ? (
          <div className="p-3 space-y-3">
            <div className="flex items-start gap-2">
              <Skeleton className="h-2 w-2 rounded-full mt-1.5 flex-shrink-0" />
              <div className="flex-1 space-y-2 min-w-0">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Skeleton className="h-2 w-2 rounded-full mt-1.5 flex-shrink-0" />
              <div className="flex-1 space-y-2 min-w-0">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Skeleton className="h-2 w-2 rounded-full mt-1.5 flex-shrink-0" />
              <div className="flex-1 space-y-2 min-w-0">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          </div>
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
          disabled={!projectId || creating}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          {creating ? "Creating..." : "New Chat"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setNewIssueDialogOpen(true)}
          disabled={!projectId}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Issue
        </Button>
      </div>

      {/* Active Agents Section */}
      {activeAgentTasks.length > 0 && (
        <div className="p-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]/20">
          {/* Clickable header with chevron */}
          <button
            onClick={() => setActiveAgentsExpanded(!activeAgentsExpanded)}
            className="w-full flex items-center gap-2 mb-2 hover:opacity-80 transition-opacity"
          >
            {activeAgentsExpanded ? (
              <ChevronDown className="h-4 w-4 text-purple-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-purple-400" />
            )}
            <svg className="h-4 w-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
            <h2 className="font-medium text-[var(--text-primary)] text-sm">Active Agents</h2>
            <span className="text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
              {activeAgentTasks.length}
            </span>
          </button>
          {/* Collapsible agent list with smooth transition */}
          <div
            className={`
              space-y-2 overflow-y-auto transition-all duration-300 ease-in-out
              ${activeAgentsExpanded ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}
            `}
          >
            {activeAgentTasks.map((task: Task) => (
              <AgentCard
                key={task.id}
                task={task}
                projectSlug={projectSlug}
              />
            ))}
          </div>
        </div>
      )}

      {/* Blocked Tasks Section */}
      {blockedTasks && blockedTasks.length > 0 && (
        <div className="p-3 border-b border-[var(--border)] bg-red-500/5">
          {/* Clickable header with chevron */}
          <button
            onClick={() => setBlockedExpanded(!blockedExpanded)}
            className="w-full flex items-center gap-2 mb-2 hover:opacity-80 transition-opacity"
          >
            {blockedExpanded ? (
              <ChevronDown className="h-4 w-4 text-red-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-red-500" />
            )}
            <svg className="h-4 w-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <h2 className="font-medium text-[var(--text-primary)] text-sm">Blocked</h2>
            <span className="text-xs bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded">
              {blockedTasks.length}
            </span>
          </button>
          {/* Collapsible blocked task list */}
          <div
            className={`
              space-y-1 overflow-hidden transition-all duration-300 ease-in-out
              ${blockedExpanded ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}
            `}
          >
            {blockedTasks.map((task) => (
              <Link
                key={task.id}
                href={projectSlug ? `/projects/${projectSlug}/board?task=${task.id}` : '#'}
                className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-red-500/10 transition-colors group"
              >
                <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-red-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[var(--text-primary)] group-hover:text-red-500 truncate">
                    {truncateTitle(task.title, 40)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-[var(--text-muted)]">
                      {formatDuration(task.updated_at)}
                    </span>
                    {task.agent_retry_count && task.agent_retry_count > 0 && (
                      <span className="text-xs text-orange-500">
                        {task.agent_retry_count} retry{task.agent_retry_count > 1 ? 'ies' : 'y'}
                      </span>
                    )}
                  </div>
                </div>
                {task.escalated ? (
                  <span className="text-xs bg-orange-500/20 text-orange-500 px-1 py-0.5 rounded flex-shrink-0">
                    ⚠️
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Divider with Work Queue header */}
      <div className="p-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]/30">
        {/* Clickable header with chevron */}
        <button
          onClick={() => setWorkQueueExpanded(!workQueueExpanded)}
          className="w-full flex items-center justify-between hover:opacity-80 transition-opacity"
        >
          <div className="flex items-center gap-2">
            {workQueueExpanded ? (
              <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
            )}
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
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </button>
      </div>

      {/* Work Queue sections */}
      <div
        className={`flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${workQueueExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}
      >
        {loadingTasks || !projectId ? (
          <div className="p-3 space-y-4">
            {/* In Progress skeleton */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-3" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-6" />
              </div>
              <div className="pl-5 space-y-2">
                <div className="flex items-start gap-2">
                  <Skeleton className="h-2 w-2 rounded-full mt-1 flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-2 w-16" />
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Skeleton className="h-2 w-2 rounded-full mt-1 flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-4/5" />
                    <Skeleton className="h-2 w-12" />
                  </div>
                </div>
              </div>
            </div>
            {/* In Review skeleton */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-3" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-6" />
              </div>
              <div className="pl-5">
                <div className="flex items-start gap-2">
                  <Skeleton className="h-2 w-2 rounded-full mt-1 flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-2 w-14" />
                  </div>
                </div>
              </div>
            </div>
          </div>
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
                      const hasAgent = !!task.agent_session_key

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
                            {/* Agent status line for in_progress and in_review */}
                            {(section.status === "in_progress" || section.status === "in_review") && (
                              <AgentStatus
                                task={task}
                                session={sessionByTaskId.get(task.id) ?? (task.agent_session_key ? sessionByKey.get(task.agent_session_key) : undefined)}
                                variant="compact"
                              />
                            )}
                            {/* Show duration only for in_progress without agent */}
                            {section.status === "in_progress" && !hasAgent && (
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
      {projectId && (
        <NewIssueDialog
          projectId={projectId}
          open={newIssueDialogOpen}
          onOpenChange={setNewIssueDialogOpen}
          onCreated={(taskId) => {
            // Convex reactive subscription will update automatically
            console.log("New issue created:", taskId)
          }}
        />
      )}
    </>
  )
}
