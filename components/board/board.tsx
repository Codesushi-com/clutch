"use client"

import { useState, useMemo, useCallback, useRef } from "react"
import { DragDropContext, type DropResult } from "@hello-pangea/dnd"
import { Plus, Settings2 } from "lucide-react"
import { usePaginatedBoardTasks } from "@/lib/hooks/use-convex-tasks"
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

// Pending optimistic move: taskId → target status
type PendingMoves = Map<string, TaskStatus>

export function Board({ projectId, onTaskClick, onAddTask }: BoardProps) {
  // Use paginated Convex hook for reactive task data with per-column pagination
  const { tasksByStatus, totalCounts, isLoading, hasMore, loadMore } = usePaginatedBoardTasks(projectId)
  
  const isMobile = useMobileDetection(768)

  // Optimistic move overrides — applied on top of Convex data so cards
  // don't snap back while the mutation is in flight.
  const [pendingMoves, setPendingMoves] = useState<PendingMoves>(new Map())

  // Optimistic reorder overrides — task id list per column while reorder is in flight.
  // When set, overrides the Convex ordering for that column.
  const [pendingReorders, setPendingReorders] = useState<Map<TaskStatus, string[]>>(new Map())

  // Track in-flight requests to avoid stale cleanup
  const reorderSeqRef = useRef(0)

  // Derive active pending moves: only those not yet reflected in Convex.
  // This is a pure derivation — no effect/setState needed for cleanup.
  const activePendingMoves = useMemo(() => {
    if (pendingMoves.size === 0) return pendingMoves
    const active = new Map<string, TaskStatus>()
    for (const [taskId, targetStatus] of pendingMoves) {
      const alreadyInTarget = tasksByStatus[targetStatus]?.some(t => t.id === taskId)
      if (!alreadyInTarget) {
        active.set(taskId, targetStatus)
      }
    }
    return active
  }, [pendingMoves, tasksByStatus])
  
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

    if (destination.droppableId === source.droppableId) {
      // Same column — reorder operation
      const columnTasks = getTasksForColumn(newStatus)
      const reordered = [...columnTasks]
      const [moved] = reordered.splice(source.index, 1)
      reordered.splice(destination.index, 0, moved)

      // Optimistic: show reordered list immediately
      const seq = ++reorderSeqRef.current
      setPendingReorders(prev => new Map(prev).set(newStatus, reordered.map(t => t.id)))

      fetch("/api/tasks/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          status: newStatus,
          task_id: draggableId,
          new_index: destination.index,
        }),
      })
        .then(res => {
          if (!res.ok) throw new Error("Reorder failed")
        })
        .catch(() => {
          // Revert on failure (only if no newer reorder superseded this one)
          if (reorderSeqRef.current === seq) {
            setPendingReorders(prev => {
              const next = new Map(prev)
              next.delete(newStatus)
              return next
            })
          }
        })
        .finally(() => {
          // Clear optimistic override after a short delay so Convex subscription
          // has time to deliver the updated positions
          setTimeout(() => {
            if (reorderSeqRef.current === seq) {
              setPendingReorders(prev => {
                const next = new Map(prev)
                next.delete(newStatus)
                return next
              })
            }
          }, 2000)
        })
    } else {
      // Moving to different column — record optimistic move so the card
      // stays in the target column while the API call is in flight.
      setPendingMoves(prev => new Map(prev).set(draggableId, newStatus))

      fetch(`/api/tasks/${draggableId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
        .then(res => {
          if (!res.ok) throw new Error("Move failed")
        })
        .catch(() => {
          // Revert optimistic move on failure
          setPendingMoves(prev => {
            const next = new Map(prev)
            next.delete(draggableId)
            return next
          })
        })
    }
  }

  // Get tasks for a specific column, applying optimistic move and reorder overrides
  const getTasksForColumn = useCallback((status: TaskStatus): Task[] => {
    let tasks: Task[]

    if (activePendingMoves.size === 0) {
      tasks = tasksByStatus?.[status] ?? []
    } else {
      // Collect all tasks from Convex, then relocate any that have pending moves
      const allTasks: Task[] = []
      for (const col of Object.keys(tasksByStatus) as TaskStatus[]) {
        for (const task of tasksByStatus[col]) {
          allTasks.push(task)
        }
      }

      tasks = allTasks.filter(task => {
        const pendingStatus = activePendingMoves.get(task.id)
        if (pendingStatus !== undefined) {
          return pendingStatus === status
        }
        return task.status === status
      })
    }

    // Apply optimistic reorder if one is pending for this column
    const reorderIds = pendingReorders.get(status)
    if (reorderIds) {
      const taskMap = new Map(tasks.map(t => [t.id, t]))
      const reordered: Task[] = []
      for (const id of reorderIds) {
        const task = taskMap.get(id)
        if (task) reordered.push(task)
      }
      // Append any tasks not in the reorder list (e.g. newly created during flight)
      for (const task of tasks) {
        if (!reorderIds.includes(task.id)) {
          reordered.push(task)
        }
      }
      return reordered
    }

    return tasks
  }, [tasksByStatus, activePendingMoves, pendingReorders])

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
        projectId={projectId}
        totalCounts={totalCounts}
        hasMore={hasMore}
        onLoadMore={loadMore}
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
        {/* Mobile: horizontal scroll flex layout */}
        <div className="flex lg:hidden gap-4 overflow-x-auto pb-4">
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
              isMobile={true}
              projectId={projectId}
              totalCount={totalCounts[col.status]}
              hasMore={hasMore[col.status]}
              onLoadMore={() => loadMore(col.status)}
            />
          ))}
        </div>
        {/* Desktop: grid layout with horizontal scroll */}
        <div className="hidden lg:block overflow-x-auto pb-4">
          <div className="flex gap-4 items-start" style={{
            width: 'max-content',
            minWidth: '100%'
          }}>
            {visibleColumns.map((col) => (
              <div key={col.status} style={{ width: '280px', flexShrink: 0 }}>
                <Column
                  status={col.status}
                  title={col.title}
                  color={col.color}
                  tasks={getTasksForColumn(col.status)}
                  onTaskClick={onTaskClick}
                  onAddTask={() => onAddTask(col.status)}
                  showAddButton={col.showAdd}
                  projectId={projectId}
                  totalCount={totalCounts[col.status]}
                  hasMore={hasMore[col.status]}
                  onLoadMore={() => loadMore(col.status)}
                />
              </div>
            ))}
          </div>
        </div>
      </DragDropContext>
    </div>
  )
}
