"use client"

import { useState, useEffect, useMemo } from "react"
import { X, Search, AlertCircle, Link2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { TaskSummary, TaskStatus } from "@/lib/types"
import type { TaskDependencyInput } from "@/lib/stores/task-store"

interface CreateDependencyPickerProps {
  projectId: string
  selectedDependencies: TaskDependencyInput[]
  onDependenciesChange: (dependencies: TaskDependencyInput[]) => void
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: "#52525b",
  ready: "#3b82f6",
  in_progress: "#eab308",
  in_review: "#a855f7",
  blocked: "#ef4444",
  done: "#22c55e",
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  in_review: "Review",
  blocked: "Blocked",
  done: "Done",
}

export function CreateDependencyPicker({
  projectId,
  selectedDependencies,
  onDependenciesChange,
}: CreateDependencyPickerProps) {
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)

  // Fetch available tasks from the project
  useEffect(() => {
    if (!projectId || !isOpen) return

    async function fetchTasks() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/tasks?projectId=${projectId}`)
        if (!response.ok) {
          throw new Error("Failed to fetch tasks")
        }
        const data = await response.json()
        setTasks(data.tasks || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tasks")
      } finally {
        setLoading(false)
      }
    }

    fetchTasks()
  }, [projectId, isOpen])

  // Get full task objects for selected dependencies
  const selectedTaskDetails = useMemo(() => {
    return selectedDependencies
      .map((dep) => {
        const task = tasks.find((t) => t.id === dep.task_id)
        return task ? { ...dep, task } : null
      })
      .filter(Boolean) as (TaskDependencyInput & { task: TaskSummary })[]
  }, [selectedDependencies, tasks])

  // Filter out already selected tasks and match search
  const availableTasks = useMemo(() => {
    const selectedIds = new Set(selectedDependencies.map((d) => d.task_id))

    return tasks.filter((t) => {
      if (selectedIds.has(t.id)) return false
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      return t.title.toLowerCase().includes(query)
    })
  }, [tasks, selectedDependencies, searchQuery])

  const handleAddDependency = (taskId: string, direction: "depends_on" | "blocks") => {
    const newDep: TaskDependencyInput = { task_id: taskId, direction }
    onDependenciesChange([...selectedDependencies, newDep])
    setSearchQuery("")
  }

  const handleRemoveDependency = (taskId: string) => {
    onDependenciesChange(selectedDependencies.filter((d) => d.task_id !== taskId))
  }

  return (
    <div className="space-y-3">
      {/* Selected Dependencies List */}
      {selectedTaskDetails.length > 0 && (
        <div className="space-y-2">
          {selectedTaskDetails.map(({ task, direction }) => (
            <div
              key={task.id}
              className="flex items-center gap-2 p-2 rounded bg-[var(--bg-primary)] border border-[var(--border)]"
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: STATUS_COLORS[task.status] }}
                title={STATUS_LABELS[task.status]}
              />
              <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
                {direction === "depends_on" ? "Blocked by" : "Blocks"}
              </span>
              <ArrowRight className="h-3 w-3 text-[var(--text-muted)] flex-shrink-0" />
              <span className="text-sm text-[var(--text-primary)] line-clamp-1 flex-1">
                {task.title}
              </span>
              <button
                onClick={() => handleRemoveDependency(task.id)}
                className="p-1 text-[var(--text-muted)] hover:text-red-500 rounded transition-colors flex-shrink-0"
                title="Remove dependency"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Dependency Section */}
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--accent-blue)] border border-dashed border-[var(--border)] hover:border-[var(--accent-blue)] rounded-lg transition-colors w-full"
        >
          <Link2 className="h-4 w-4" />
          Add dependency
        </button>
      ) : (
        <div className="border border-[var(--border)] rounded-lg p-3 space-y-3 bg-[var(--bg-primary)]">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="pl-10 bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              autoFocus
            />
          </div>

          {error && (
            <div className="p-2 bg-red-500/10 border border-red-500/30 rounded flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}

          {/* Task List */}
          <div className="max-h-48 overflow-y-auto space-y-1">
            {loading ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-4">
                Loading tasks...
              </p>
            ) : availableTasks.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-4">
                {searchQuery.trim()
                  ? `No tasks matching "${searchQuery}"`
                  : "No available tasks"}
              </p>
            ) : (
              availableTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-2 rounded border border-[var(--border)] hover:border-[var(--accent-blue)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <div className="flex items-start gap-2 mb-2">
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ backgroundColor: STATUS_COLORS[task.status] }}
                    />
                    <span className="text-sm text-[var(--text-primary)] line-clamp-2 flex-1">
                      {task.title}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddDependency(task.id, "depends_on")}
                      className="flex-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] hover:bg-[var(--accent-blue)]/20 text-[var(--text-secondary)] hover:text-[var(--accent-blue)] rounded transition-colors"
                    >
                      Blocked by this
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddDependency(task.id, "blocks")}
                      className="flex-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] hover:bg-[var(--accent-blue)]/20 text-[var(--text-secondary)] hover:text-[var(--accent-blue)] rounded transition-colors"
                    >
                      Blocks this
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cancel */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setIsOpen(false)
              setSearchQuery("")
              setError(null)
            }}
            className="w-full"
          >
            Done
          </Button>
        </div>
      )}
    </div>
  )
}
