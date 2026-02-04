"use client"

import { Droppable } from "@hello-pangea/dnd"
import type { Task, TaskStatus } from "@/lib/db/types"
import { TaskCard } from "./task-card"
import { Plus } from "lucide-react"

interface ColumnProps {
  status: TaskStatus
  title: string
  tasks: Task[]
  color: string
  onAddTask?: () => void
  onTaskClick: (task: Task) => void
  showAddButton?: boolean
  isMobile?: boolean
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
}: ColumnProps) {
  return (
    <div className={`flex flex-col bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] min-h-[500px] ${
      isMobile 
        ? "w-full" 
        : "w-[280px] flex-shrink-0 lg:w-auto lg:min-w-0"
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
            {tasks.length}
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
              />
            ))}
            {provided.placeholder}
            
            {tasks.length === 0 && !snapshot.isDraggingOver && (
              <div className="text-center py-8 text-sm text-[var(--text-muted)]">
                No tasks
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
