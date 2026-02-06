"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { X, Search, AlertCircle, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Task, TaskSummary, TaskStatus } from "@/lib/db/types"

interface DependencyPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: Task | null
  currentProjectId: string
  existingDependencyIds: string[]
  onAddDependency: (dependsOnId: string) => Promise<void>
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: "#52525b",
  ready: "#3b82f6",
  in_progress: "#eab308",
  in_review: "#a855f7",
  done: "#22c55e",
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  in_review: "Review",
  done: "Done",
}

export function DependencyPicker({
  open,
  onOpenChange,
  task,
  currentProjectId,
  existingDependencyIds,
  onAddDependency,
}: DependencyPickerProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)

  // Fetch tasks from the same project when picker opens
  useEffect(() => {
    if (!open || !currentProjectId) return

    async function fetchTasks() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/tasks?projectId=${currentProjectId}`)
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
  }, [open, currentProjectId])

  // Reset search when picker closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("")
      setError(null)
    }
  }, [open])

  // Filter tasks: same project, exclude self, exclude existing deps, match search
  const filteredTasks = useMemo(() => {
    if (!task) return []

    const taskId = task.id
    const excludedIds = new Set([taskId, ...existingDependencyIds])

    return tasks.filter((t) => {
      // Exclude self and existing dependencies
      if (excludedIds.has(t.id)) return false

      // Match search query
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      return t.title.toLowerCase().includes(query)
    })
  }, [tasks, task, existingDependencyIds, searchQuery])

  const handleAdd = useCallback(
    async (dependsOnId: string) => {
      setAddingId(dependsOnId)
      setError(null)
      try {
        await onAddDependency(dependsOnId)
        onOpenChange(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add dependency")
      } finally {
        setAddingId(null)
      }
    },
    [onAddDependency, onOpenChange]
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal */}
      <div className="relative bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-[var(--accent-blue)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Add Dependency
            </h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="pl-10 bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              autoFocus
            />
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            Select a task that must be completed before this one can start.
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {/* Task list */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="py-8 text-center text-[var(--text-muted)]">
              Loading tasks...
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="py-8 text-center text-[var(--text-muted)]">
              {searchQuery.trim() ? (
                <p>No tasks matching &ldquo;{searchQuery}&rdquo;</p>
              ) : (
                <p>No available tasks to add as dependency</p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleAdd(t.id)}
                  disabled={addingId === t.id}
                  className="w-full text-left p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] hover:border-[var(--accent-blue)] hover:bg-[var(--bg-tertiary)] transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    {/* Status indicator */}
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ backgroundColor: STATUS_COLORS[t.status] }}
                      title={STATUS_LABELS[t.status]}
                    />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--text-primary)] line-clamp-2 group-hover:text-[var(--accent-blue)] transition-colors">
                        {t.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: `${STATUS_COLORS[t.status]}20`,
                            color: STATUS_COLORS[t.status],
                          }}
                        >
                          {STATUS_LABELS[t.status]}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] font-mono">
                          #{t.id.substring(0, 8)}
                        </span>
                      </div>
                    </div>

                    {addingId === t.id && (
                      <div className="flex-shrink-0">
                        <div className="w-4 h-4 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] flex justify-between items-center">
          <p className="text-xs text-[var(--text-muted)]">
            {filteredTasks.length} available
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
