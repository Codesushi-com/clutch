"use client"

import { Droppable } from "@hello-pangea/dnd"
import type { Task, TaskStatus } from "@/lib/types"
import { TaskCard } from "./task-card"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ColumnProps {
  status: TaskStatus
  title: string
  tasks: Task[]
  color: string
  onAddTask?: () => void
  onTaskClick: (task: Task) => void
  showAddButton?: boolean
  isMobile?: boolean
  projectId: string
  totalCount?: number
  hasMore?: boolean
  onLoadMore?: () => void
}

export function Column({
  status,
  title,
  tasks,
  color,
  onAddTask,
  onTaskClick,
  showAddButton = false,
  isMobile = false,
  projectId,
  totalCount,
  hasMore,
  onLoadMore,
}: ColumnProps) {
  // Use totalCount if provided, otherwise fall back to tasks.length
  const displayCount = totalCount !== undefined ? totalCount : tasks.length

  return (
    <div className={`flex flex-col bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] max-h-[calc(100vh-200px)] ${
      isMobile
        ? "w-full"
        : "w-[280px] flex-shrink-0 lg:w-full lg:min-w-[280px]"
    }`}>
      {/* Header */}
      <div className="p-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="font-medium text-[var(--text-primary)]">
            {title}
          </span>
          <span className="text-xs text-[var(--text-muted)] ml-auto">
            {displayCount}
          </span>
        </div>
      </div>
      
      {/* Droppable Task Area */}
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-2 space-y-2 overflow-y-auto transition-colors ${
              snapshot.isDraggingOver 
                ? "bg-[var(--accent-blue)]/10 border-2 border-dashed border-[var(--accent-blue)] rounded" 
                : ""
            }`}
          >
            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onClick={() => onTaskClick(task)}
                isMobile={isMobile}
                projectId={projectId}
                columnTasks={tasks}
              />
            ))}
            {provided.placeholder}

            {tasks.length === 0 && !snapshot.isDraggingOver && (
              <div className="text-center py-8 text-sm text-[var(--text-muted)]">
                No tasks
              </div>
            )}

            {/* Load more button */}
            {hasMore && onLoadMore && (
              <div className="pt-2 pb-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLoadMore}
                  className="w-full text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Load more ({tasks.length} of {displayCount})
                </Button>
              </div>
            )}
          </div>
        )}
      </Droppable>

      {/* Add button */}
      {showAddButton && onAddTask && (
        <div className="p-2 border-t border-[var(--border)]">
          <button
            onClick={onAddTask}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add task
          </button>
        </div>
      )}
    </div>
  )
}
