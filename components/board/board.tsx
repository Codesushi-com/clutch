"use client"

import { useState, useMemo } from "react"
import { DragDropContext, type DropResult } from "@hello-pangea/dnd"
import { Plus, Eye, EyeOff } from "lucide-react"
import { useTaskStore } from "@/lib/stores/task-store"
import { useConvexBoardTasks } from "@/lib/hooks/use-convex-tasks"
import { Column } from "./column"
import { MobileBoard } from "./mobile-board"
import { useMobileDetection } from "./use-mobile-detection"
import type { Task, TaskStatus } from "@/lib/types"

interface BoardProps {
  projectId: string
  onTaskClick: (task: Task) => void
  onAddTask: (status: TaskStatus) => void
}

const COLUMNS: { status: TaskStatus; title: string; color: string; showAdd: boolean }[] = [
  { status: "backlog", title: "Backlog", color: "#52525b", showAdd: true },
  { status: "ready", title: "Ready", color: "#3b82f6", showAdd: true },
  { status: "in_progress", title: "In Progress", color: "#eab308", showAdd: false },
  { status: "in_review", title: "Review", color: "#a855f7", showAdd: false },
  { status: "done", title: "Done", color: "#22c55e", showAdd: false },
]

export function Board({ projectId, onTaskClick, onAddTask }: BoardProps) {
  // Use Convex for reactive task data (real-time updates)
  const { tasksByStatus, isLoading } = useConvexBoardTasks(projectId)
  
  // Use zustand store for mutations (HTTP POST to API routes)
  const { moveTask } = useTaskStore()
  
  const isMobile = useMobileDetection(768)
  
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
  const handleToggleShowDone = () => {
    const newValue = !showDone
    setShowDone(newValue)
    const prefs = { showDone: newValue }
    localStorage.setItem(`board-prefs-${projectId}`, JSON.stringify(prefs))
  }

  // Determine which columns should be visible
  const visibleColumns = useMemo(() => {
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
      if (col.status === "in_review") {
        return (tasksByStatus?.in_review?.length ?? 0) > 0
      }
      
      return true
    })
  }, [tasksByStatus, showDone])

  const handleDragEnd = (result: DropResult) => {
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

    // If same column, it's a reorder operation
    if (destination.droppableId === source.droppableId) {
      moveTask(draggableId, newStatus, destination.index)
    } else {
      // Moving to different column
      moveTask(draggableId, newStatus)
    }
  }

  // Get tasks for a specific column from Convex data
  const getTasksForColumn = (status: TaskStatus): Task[] => {
    return tasksByStatus?.[status] ?? []
  }

  if (isLoading) {
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

  // Mobile view
  if (isMobile) {
    return (
      <MobileBoard
        columns={visibleColumns}
        getTasksByStatus={getTasksForColumn}
        onTaskClick={onTaskClick}
        onAddTask={onAddTask}
        onDragEnd={handleDragEnd}
        showDone={showDone}
        onToggleShowDone={handleToggleShowDone}
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
        </div>
        <div className="flex items-center gap-3">
          {/* Show Done toggle */}
          <button
            onClick={handleToggleShowDone}
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
          gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(280px, 1fr))`
        }}>
          {visibleColumns.map((col) => (
            <Column
              key={col.status}
              status={col.status}
              title={col.title}
              color={col.color}
              tasks={getTasksForColumn(col.status)}
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
