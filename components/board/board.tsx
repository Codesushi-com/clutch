"use client"

import { useEffect } from "react"
import { useTaskStore } from "@/lib/stores/task-store"
import { Column } from "./column"
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
  const { tasks, loading, error, fetchTasks, getTasksByStatus } = useTaskStore()

  useEffect(() => {
    fetchTasks(projectId)
  }, [fetchTasks, projectId])

  if (loading && tasks.length === 0) {
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

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUMNS.map((col) => (
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
  )
}
