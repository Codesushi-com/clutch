"use client"

import { useState, useMemo, useCallback } from "react"
import { DragDropContext, type DropResult } from "@hello-pangea/dnd"
import { Plus, Settings2 } from "lucide-react"
import { useTaskStore } from "@/lib/stores/task-store"
import { useConvexBoardTasks } from "@/lib/hooks/use-convex-tasks"
import { Column } from "./column"
import { MobileBoard } from "./mobile-board"
import { useMobileDetection } from "./use-mobile-detection"
import type { Task, TaskStatus } from "@/lib/types"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"

interface BoardProps {
  projectId: string
  onTaskClick: (task: Task) => void
  onAddTask: (status: TaskStatus) => void
}

const COLUMNS: { status: TaskStatus; title: string; color: string; showAdd: boolean }[] = [
  { status: "backlog", title: "Backlog", color: "#52525b", showAdd: true },
  { status: "ready", title: "Ready", color: "#3b82f6", showAdd: true },
  { status: "in_progress", title: "In Progress", color: "#eab308", showAdd: false },
  { status: "in_review", title: "In Review", color: "#a855f7", showAdd: false },
  { status: "done", title: "Done", color: "#22c55e", showAdd: false },
]

const STORAGE_KEY = (projectId: string) => `board-column-visibility-${projectId}`

// Default visibility: all columns visible
const DEFAULT_VISIBILITY: Record<TaskStatus, boolean> = {
  backlog: true,
  ready: true,
  in_progress: true,
  in_review: true,
  done: true,
}

function getInitialVisibility(projectId: string): Record<TaskStatus, boolean> {
  if (typeof window === 'undefined') return DEFAULT_VISIBILITY
  try {
    const saved = localStorage.getItem(STORAGE_KEY(projectId))
    if (saved) {
      const parsed = JSON.parse(saved)
      // Merge with defaults to handle new columns
      return { ...DEFAULT_VISIBILITY, ...parsed }
    }
  } catch (error) {
    console.error('Failed to parse column visibility:', error)
  }
  return DEFAULT_VISIBILITY
}

export function Board({ projectId, onTaskClick, onAddTask }: BoardProps) {
  // Use Convex for reactive task data (real-time updates)
  const { tasksByStatus, isLoading } = useConvexBoardTasks(projectId)
  
  // Use zustand store for mutations (HTTP POST to API routes)
  const { moveTask } = useTaskStore()
  
  const isMobile = useMobileDetection(768)
  
  // Column visibility state - initialize from localStorage
  const [columnVisibility, setColumnVisibility] = useState<Record<TaskStatus, boolean>>(
    () => getInitialVisibility(projectId)
  )
  
  // Save visibility to localStorage whenever it changes
  const updateColumnVisibility = useCallback((status: TaskStatus, visible: boolean) => {
    setColumnVisibility(prev => {
      const next = { ...prev, [status]: visible }
      localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(next))
      return next
    })
  }, [projectId])
  
  // Toggle all columns at once
  const toggleAllColumns = useCallback((visible: boolean) => {
    const next: Record<TaskStatus, boolean> = {
      backlog: visible,
      ready: visible,
      in_progress: visible,
      in_review: visible,
      done: visible,
    }
    setColumnVisibility(next)
    localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(next))
  }, [projectId])

  // Determine which columns should be visible
  const visibleColumns = useMemo(() => {
    return COLUMNS.filter(col => columnVisibility[col.status])
  }, [columnVisibility])

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
        columnVisibility={columnVisibility}
        onToggleColumn={updateColumnVisibility}
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
          {/* Column Visibility Dropdown */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2 bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
              >
                <Settings2 className="h-4 w-4" />
                Columns
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 bg-[var(--bg-secondary)] border-[var(--border)] p-3" align="end">
              <div className="space-y-3">
                <div className="text-sm font-medium text-[var(--text-primary)] border-b border-[var(--border)] pb-2">
                  Show Columns
                </div>
                <div className="space-y-2">
                  {COLUMNS.map((col) => (
                    <label
                      key={col.status}
                      className="flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-tertiary)] rounded px-1 py-1 transition-colors"
                    >
                      <Checkbox
                        checked={columnVisibility[col.status]}
                        onCheckedChange={(checked) => 
                          updateColumnVisibility(col.status, checked === true)
                        }
                        id={`col-${col.status}`}
                      />
                      <div className="flex items-center gap-2 flex-1">
                        <div 
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: col.color }}
                        />
                        <span className="text-sm text-[var(--text-primary)]">
                          {col.title}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="pt-2 border-t border-[var(--border)] flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-xs h-7 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    onClick={() => toggleAllColumns(true)}
                  >
                    Show All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-xs h-7 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    onClick={() => toggleAllColumns(false)}
                  >
                    Hide All
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          <Button
            onClick={() => onAddTask("backlog")}
            size="sm"
            className="flex items-center gap-2 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/90 text-white"
          >
            <Plus className="h-4 w-4" />
            New Ticket
          </Button>
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
