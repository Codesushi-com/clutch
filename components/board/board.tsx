"use client"

import { useState, useEffect } from "react"
import { DragDropContext, type DropResult } from "@hello-pangea/dnd"
import { Plus, Eye, EyeOff, Wifi, WifiOff } from "lucide-react"
import { useConvexTasks, useMoveTask, useTaskStore } from "@/lib/stores/task-store"
import { useWebSocket } from "@/lib/websocket/client"
import { Column } from "./column"
import { MobileBoard } from "./mobile-board"
import { useMobileDetection } from "./use-mobile-detection"
import type { Task, TaskStatus } from "@/lib/db/types"

interface BoardProps {
  projectId: string
  onTaskClick: (task: Task) => void
  onAddTask: (status: TaskStatus) => void
}

const COLUMNS: { status: TaskStatus; title: string; color: string; showAdd: boolean }[] = [
  { status: "backlog", title: "Backlog", color: "#52525b", showAdd: true },
  { status: "ready", title: "Ready", color: "#3b82f6", showAdd: true },
  { status: "in_progress", title: "In Progress", color: "#eab308", showAdd: false },
  { status: "review", title: "Review", color: "#a855f7", showAdd: false },
  { status: "done", title: "Done", color: "#22c55e", showAdd: false },
]

export function Board({ projectId, onTaskClick, onAddTask }: BoardProps) {
  const { setTasks, getTasksByStatus, handleWebSocketMessage, setWebSocketConnected } = useTaskStore()

  // Fetch tasks from Convex
  const { tasks: convexTasks, loading, error } = useConvexTasks(projectId)

  // Move task mutation
  const moveTaskMutation = useMoveTask()

  // Sync Convex tasks to Zustand store
  useEffect(() => {
    if (convexTasks) {
      setTasks(convexTasks)
    }
  }, [convexTasks, setTasks])

  const isMobile = useMobileDetection(768)

  // WebSocket connection for real-time updates
  const { connected: wsConnected, subscribers } = useWebSocket({
    projectId,
    userId: 'anonymous', // TODO: Get actual user ID from auth
    onMessage: handleWebSocketMessage,
    onConnect: () => setWebSocketConnected(true),
    onDisconnect: () => setWebSocketConnected(false)
  })

  // Column visibility state - initialize from localStorage
  const [showDone, setShowDone] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      const savedPrefs = localStorage.getItem(`board-prefs-${projectId}`)
      if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs)
        return prefs.showDone ?? false
      }
    } catch (error) {
      console.error('Failed to parse board preferences:', error)
    }
    return false
  })

  // Save preferences to localStorage whenever they change
  useEffect(() => {
    const prefs = { showDone }
    localStorage.setItem(`board-prefs-${projectId}`, JSON.stringify(prefs))
  }, [projectId, showDone])

  // Determine which columns should be visible
  const getVisibleColumns = () => {
    return COLUMNS.filter(col => {
      // Always show backlog, ready, and in_progress
      if (["backlog", "ready", "in_progress"].includes(col.status)) {
        return true
      }

      // Show Done column only if user has toggled it on
      if (col.status === "done") {
        return showDone
      }

      // Show Review column only if it has tasks (auto-hide when empty)
      if (col.status === "review") {
        return getTasksByStatus("review").length > 0
      }

      return true
    })
  }

  const toggleShowDone = () => {
    setShowDone(!showDone)
  }

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result

    // Dropped outside a column
    if (!destination) return

    // Dropped in same position
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return
    }

    const newStatus = destination.droppableId as TaskStatus

    // Call Convex mutation
    await moveTaskMutation(draggableId, newStatus, destination.index)
  }

  if (loading && convexTasks.length === 0) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <div
            key={col.status}
            className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] min-h-[500px] w-[280px] flex-shrink-0 animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        {error}
      </div>
    )
  }

  // Mobile view
  if (isMobile) {
    return (
      <MobileBoard
        columns={getVisibleColumns()}
        getTasksByStatus={getTasksByStatus}
        onTaskClick={onTaskClick}
        onAddTask={onAddTask}
        onDragEnd={handleDragEnd}
        showDone={showDone}
        onToggleShowDone={toggleShowDone}
        wsConnected={wsConnected}
        subscribers={subscribers}
      />
    )
  }

  // Desktop view
  return (
    <div className="space-y-6">
      {/* Board Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            Board
          </h2>
          {/* WebSocket connection status */}
          <div className="flex items-center gap-1" title={wsConnected ? "Connected - real-time updates active" : "Disconnected - changes may not appear immediately"}>
            {wsConnected ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
            <span className="text-xs text-[var(--text-secondary)]">
              {wsConnected ? 'Live' : 'Offline'}
            </span>
            {subscribers.length > 0 && (
              <span className="text-xs text-[var(--text-secondary)]">
                • {subscribers.length} viewing
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Show Done toggle */}
          <button
            onClick={toggleShowDone}
            className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors text-sm"
            title={showDone ? "Hide completed tasks" : "Show completed tasks"}
          >
            {showDone ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showDone ? "Hide Done" : "Show Done"}
          </button>

          <button
            onClick={() => onAddTask("backlog")}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-blue)] text-white rounded-lg hover:bg-[var(--accent-blue)]/90 transition-colors font-medium"
          >
            <Plus className="h-4 w-4" />
            New Ticket
          </button>
        </div>
      </div>

      {/* Board Columns */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 lg:grid lg:overflow-visible" style={{
          gridTemplateColumns: `repeat(${getVisibleColumns().length}, minmax(280px, 1fr))`
        }}>
          {getVisibleColumns().map((col) => (
            <Column
              key={col.status}
              status={col.status}
              title={col.title}
              color={col.color}
              tasks={getTasksByStatus(col.status)}
              onTaskClick={onTaskClick}
              onAddTask={() => onAddTask(col.status)}
              showAddButton={col.showAdd}
            />
          ))}
        </div>
      </DragDropContext>
    </div>
  )
}
