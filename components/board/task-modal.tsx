"use client"

import { useState, useEffect, useCallback } from "react"
import { X, Trash2, Clock, Calendar, MessageSquare, Send, Loader2, Link2, CheckCircle2, Circle, Plus, BarChart3, Pencil, History, OctagonX } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useUpdateTask, useDeleteTask } from "@/lib/stores/task-store"
import { CommentThread } from "./comment-thread"
import { CommentInput } from "./comment-input"
import { DependencyPicker } from "./dependency-picker"
import { TaskAnalysisContent } from "./task-analysis-content"
import { TaskTimeline } from "./task-timeline"
import { MarkdownContent } from "@/components/chat/markdown-content"
import { useTaskEvents } from "@/lib/hooks/use-task-events"
import { useDependencies } from "@/lib/hooks/use-dependencies"
import { useParams } from "next/navigation"
import type { Task, TaskStatus, TaskPriority, TaskRole, Comment, DispatchStatus, TaskDependencySummary } from "@/lib/types"

interface TaskModalProps {
  task: Task | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete?: (taskId: string) => void
}

const STATUS_OPTIONS: { value: TaskStatus; label: string; color: string }[] = [
  { value: "backlog", label: "Backlog", color: "#52525b" },
  { value: "ready", label: "Ready", color: "#3b82f6" },
  { value: "in_progress", label: "In Progress", color: "#eab308" },
  { value: "in_review", label: "Review", color: "#a855f7" },
  { value: "blocked", label: "Blocked", color: "#ef4444" },
  { value: "done", label: "Done", color: "#22c55e" },
]

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "#52525b" },
  { value: "medium", label: "Medium", color: "#3b82f6" },
  { value: "high", label: "High", color: "#f97316" },
  { value: "urgent", label: "Urgent", color: "#ef4444" },
]

const ROLES: { value: TaskRole; label: string }[] = [
  { value: "pm", label: "PM" },
  { value: "dev", label: "Dev" },
  { value: "research", label: "Research" },
  { value: "reviewer", label: "Reviewer" },
]

const AGENT_OPTIONS = [
  { value: "", label: "Unassigned" },
  { value: "ada", label: "Ada (Coordinator)" },
  { value: "kimi-coder", label: "Kimi (Executor)" },
  { value: "sonnet-reviewer", label: "Sonnet (Reviewer)" },
  { value: "haiku-triage", label: "Haiku (Scanner)" },
]

export function TaskModal({ task, open, onOpenChange, onDelete }: TaskModalProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<TaskStatus>("backlog")
  const [priority, setPriority] = useState<TaskPriority>("medium")
  const [role, setRole] = useState<TaskRole>("dev")
  const [assignee, setAssignee] = useState("")
  const [requiresHumanReview, setRequiresHumanReview] = useState(false)
  const [tags, setTags] = useState("")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [aborting, setAborting] = useState(false)
  const [saving, setSaving] = useState(false)

  // Comments state
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)

  // Dispatch state
  const [dispatchStatus, setDispatchStatus] = useState<DispatchStatus | null>(null)
  const [dispatching, setDispatching] = useState(false)

  // Dependency picker state
  const [pickerOpen, setPickerOpen] = useState(false)
  const [removingDepId, setRemovingDepId] = useState<string | null>(null)

  // Tab state
  const [activeTab, setActiveTab] = useState("description")

  // Editing state for description and title
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)

  // Project slug for links
  const params = useParams()
  const projectSlug = params.slug as string

  const updateTaskMutation = useUpdateTask()
  const deleteTaskMutation = useDeleteTask()

  // Dependencies
  const { dependencies, refresh: refreshDependencies } = useDependencies(task?.id || null)
  const dependsOn = dependencies.depends_on
  const blocks = dependencies.blocks

  // Task events (history)
  const { events: taskEvents, isLoading: loadingEvents } = useTaskEvents(task?.id || null)

  // Body scroll lock when modal is open
  useEffect(() => {
    if (!open) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [open])

  // Keyboard shortcut for dependency picker and Escape to close modal
  useEffect(() => {
    if (!open || !task) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape key to close modal (unless dependency picker is open)
      if (e.key === 'Escape' && !pickerOpen) {
        e.preventDefault()
        onOpenChange(false)
        return
      }

      // 'd' key to open dependency picker (when not typing in an input)
      if (e.key === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
        if (!isInput && !pickerOpen) {
          e.preventDefault()
          setPickerOpen(true)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, task, pickerOpen, onOpenChange])

  // Load task data when modal opens
  useEffect(() => {
    if (task && open) {
      setTitle(task.title)
      setDescription(task.description || "")
      setStatus(task.status)
      setPriority(task.priority)
      setRole(task.role || "dev")
      setAssignee(task.assignee || "")
      setRequiresHumanReview(!!task.requires_human_review)
      const taskTags = (() => {
        if (!task.tags) return []
        try {
          const parsed = JSON.parse(task.tags)
          if (typeof parsed === 'string') return JSON.parse(parsed) as string[]
          return Array.isArray(parsed) ? parsed : []
        } catch { return [] }
      })()
      setTags(taskTags.join(", "))
      setShowDeleteConfirm(false)
      setDispatchStatus(task.dispatch_status)

      // Reset editing states
      setIsEditingDescription(false)
      setIsEditingTitle(false)

      // Fetch comments
      fetchComments(task.id)
    }
  }, [task, open])

  const fetchComments = async (taskId: string) => {
    setLoadingComments(true)
    try {
      const response = await fetch(`/api/tasks/${taskId}/comments`)
      if (response.ok) {
        const data = await response.json()
        setComments(data.comments)
      }
    } finally {
      setLoadingComments(false)
    }
  }

  const handleAddComment = async (content: string) => {
    if (!task) return

    const response = await fetch(`/api/tasks/${task.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })

    if (response.ok) {
      const data = await response.json()
      setComments((prev) => [...prev, data.comment])
    }
  }

  const handleSave = async () => {
    if (!task) return

    setSaving(true)

    const tagArray = tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    const oldStatus = task.status
    const newStatus = status

    try {
      await updateTaskMutation(task.id, {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        role,
        assignee: assignee || null,
        requires_human_review: requiresHumanReview ? 1 : 0,
        tags: tagArray.length > 0 ? JSON.stringify(tagArray) : null,
      })

      // Auto-create status change comment if status changed
      if (oldStatus !== newStatus) {
        const oldLabel = STATUS_OPTIONS.find(s => s.value === oldStatus)?.label || oldStatus
        const newLabel = STATUS_OPTIONS.find(s => s.value === newStatus)?.label || newStatus

        await fetch(`/api/tasks/${task.id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `Status changed from ${oldLabel} to ${newLabel}`,
            type: "status_change",
            author: "dan",
            author_type: "human",
          }),
        })
      }

      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!task) return

    await deleteTaskMutation(task.id)
    onDelete?.(task.id)
    onOpenChange(false)
  }

  const handleAbort = async () => {
    if (!task) return

    setAborting(true)
    try {
      const response = await fetch(`/api/tasks/${task.id}/abort`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggeredBy: "dan" }),
      })

      if (response.ok) {
        // Refresh comments to show the abort comment
        fetchComments(task.id)
        // Close the modal
        onOpenChange(false)
      } else {
        const data = await response.json()
        console.error("Abort failed:", data.error)
        alert(`Failed to abort task: ${data.error}`)
      }
    } finally {
      setAborting(false)
    }
  }

  const handleDispatch = async () => {
    if (!task || !assignee) return

    setDispatching(true)
    try {
      const response = await fetch(`/api/tasks/${task.id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: assignee,
          requestedBy: "dan",
        }),
      })

      if (response.ok) {
        setDispatchStatus("pending")

        // Add a comment noting the dispatch
        await fetch(`/api/tasks/${task.id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `Task dispatched to ${AGENT_OPTIONS.find(a => a.value === assignee)?.label || assignee}`,
            type: "status_change",
            author: "dan",
            author_type: "human",
          }),
        })

        // Refresh comments
        fetchComments(task.id)
      } else {
        const data = await response.json()
        console.error("Dispatch failed:", data.error)
      }
    } finally {
      setDispatching(false)
    }
  }

  // Add a dependency
  const handleAddDependency = useCallback(async (dependsOnId: string) => {
    if (!task) throw new Error("No task selected")

    const response = await fetch(`/api/tasks/${task.id}/dependencies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ depends_on_id: dependsOnId }),
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to add dependency")
    }

    // Refresh dependencies
    await refreshDependencies()
  }, [task, refreshDependencies])

  // Remove a dependency
  const handleRemoveDependency = useCallback(async (depTask: TaskDependencySummary) => {
    if (!task || removingDepId) return

    setRemovingDepId(depTask.id)

    try {
      const deleteResponse = await fetch(
        `/api/tasks/${task.id}/dependencies/${depTask.dependency_id}`,
        { method: "DELETE" }
      )

      if (!deleteResponse.ok) {
        const errorData = await deleteResponse.json()
        throw new Error(errorData.error || "Failed to remove dependency")
      }

      await refreshDependencies()
    } catch (error) {
      console.error("Failed to remove dependency:", error)
      throw error
    } finally {
      setRemovingDepId(null)
    }
  }, [task, removingDepId, refreshDependencies])

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const handleNavigateToTask = (taskId: string) => {
    // Close current modal and navigate to the dependency task
    window.history.pushState({}, '', `?task=${taskId}`)
    onOpenChange(false)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  if (!open || !task) return null

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        />

        {/* Modal */}
        <div className="relative bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between p-4 border-b border-[var(--border)]">
            <div className="flex-1 pr-4">
              {/* Short ID */}
              <div className="mb-2">
                <span
                  className="text-xs text-[var(--text-muted)] font-mono cursor-pointer hover:text-[var(--accent-blue)] transition-colors select-all"
                  title="Click to copy ID"
                  onClick={() => navigator.clipboard.writeText(task.id.substring(0, 8))}
                >
                  #{task.id.substring(0, 8)}
                </span>
              </div>

              {/* Title */}
              {isEditingTitle ? (
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setIsEditingTitle(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setIsEditingTitle(false)
                    }
                  }}
                  className="w-full bg-transparent text-xl font-semibold text-[var(--text-primary)] border-0 border-b border-[var(--accent-blue)] focus:border-[var(--accent-blue)] focus:outline-none px-0 py-1 transition-colors"
                  placeholder="Task title"
                  autoFocus
                />
              ) : (
                <div
                  onClick={() => setIsEditingTitle(true)}
                  className="w-full group cursor-text"
                >
                  <h1 className="text-xl font-semibold text-[var(--text-primary)] px-0 py-1 border-b border-transparent hover:border-[var(--border)] transition-colors flex items-center justify-between">
                    {title || <span className="text-[var(--text-muted)]">Task title</span>}
                    <Pencil className="h-4 w-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h1>
                </div>
              )}

              {/* Status badge */}
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: STATUS_OPTIONS.find(s => s.value === status)?.color }}
                >
                  {STATUS_OPTIONS.find(s => s.value === status)?.label}
                </span>
                {requiresHumanReview && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-[var(--accent-red)] text-white">
                    Needs Review
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => onOpenChange(false)}
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <div className="px-4 pt-4">
                <TabsList>
                  <TabsTrigger value="description">
                    <span className="flex items-center gap-2">
                      Description
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="comments">
                    <span className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Comments ({comments.length})
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="analysis">
                    <span className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Analysis
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    <span className="flex items-center gap-2">
                      <History className="h-4 w-4" />
                      History
                    </span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-hidden p-4 min-h-0">
                <div className="flex gap-8 h-full min-h-0">
                  {/* Main content */}
                  <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden">
                    {/* Description Tab */}
                    <TabsContent value="description" className="mt-0 flex-1 min-h-0 h-full flex flex-col overflow-hidden">
                      {isEditingDescription ? (
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          onBlur={() => setIsEditingDescription(false)}
                          onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                              setIsEditingDescription(false)
                            }
                          }}
                          placeholder="Add a description..."
                          className="w-full flex-1 min-h-0 h-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)] resize-none"
                          autoFocus
                        />
                      ) : (
                        <div
                          onClick={() => setIsEditingDescription(true)}
                          className="w-full flex-1 min-h-0 h-full bg-[var(--bg-primary)] border border-transparent hover:border-[var(--border)] rounded-lg px-4 py-3 cursor-text group transition-colors overflow-y-auto"
                        >
                          {description.trim() ? (
                            <div className="relative">
                              <MarkdownContent content={description} variant="document" />
                              <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                                <Pencil className="h-4 w-4 text-[var(--text-muted)]" />
                              </div>
                            </div>
                          ) : (
                            <div className="relative h-full flex items-start">
                              <span className="text-[var(--text-muted)] text-sm">Click to add a description...</span>
                              <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                                <Pencil className="h-4 w-4 text-[var(--text-muted)]" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </TabsContent>

                    {/* Comments Tab */}
                    <TabsContent value="comments" className="mt-0 flex-1 min-h-0 h-full flex flex-col overflow-hidden">
                      {loadingComments ? (
                        <div className="text-sm text-[var(--text-muted)]">Loading comments...</div>
                      ) : (
                        <div className="flex flex-col h-full gap-4 min-h-0">
                          <div className="flex-1 overflow-y-auto min-h-0">
                            <CommentThread comments={comments} />
                          </div>
                          <CommentInput onSubmit={handleAddComment} />
                        </div>
                      )}
                    </TabsContent>

                    {/* Analysis Tab */}
                    <TabsContent value="analysis" className="mt-0 flex-1 min-h-0 h-full flex flex-col overflow-hidden">
                      <div className="flex-1 overflow-y-auto min-h-0">
                        <TaskAnalysisContent taskId={task.id} projectSlug={projectSlug} />
                      </div>
                    </TabsContent>

                    {/* History Tab */}
                    <TabsContent value="history" className="mt-0 flex-1 min-h-0 h-full flex flex-col overflow-hidden">
                      <div className="flex-1 overflow-y-auto min-h-0">
                        <TaskTimeline
                          events={taskEvents}
                          isLoading={loadingEvents}
                          projectSlug={projectSlug}
                        />
                      </div>
                    </TabsContent>
                  </div>

              {/* Sidebar */}
              <div className="w-64 space-y-4 flex-shrink-0 overflow-y-auto min-h-0">
                {/* Status */}
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)] mb-1 block">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)] mb-1 block">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Role */}
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)] mb-1 block">
                    Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as TaskRole)}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                {/* Assignee */}
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)] mb-1 block">
                    Assignee
                  </label>
                  <select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  >
                    {AGENT_OPTIONS.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>

                {/* Dispatch to Agent */}
                {assignee && (
                  <div>
                    <button
                      onClick={handleDispatch}
                      disabled={dispatching || dispatchStatus === "pending" || dispatchStatus === "active"}
                      className="w-full flex items-center justify-center gap-2 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/90 disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-muted)] text-white px-3 py-2 rounded text-sm font-medium transition-colors"
                    >
                      {dispatching ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Dispatching...
                        </>
                      ) : dispatchStatus === "pending" ? (
                        <>
                          <Clock className="h-4 w-4" />
                          Pending Dispatch
                        </>
                      ) : dispatchStatus === "active" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Agent Working
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Dispatch to Agent
                        </>
                      )}
                    </button>
                    {dispatchStatus && (
                      <p className="text-xs text-[var(--text-muted)] mt-1 text-center">
                        Status: {dispatchStatus}
                      </p>
                    )}
                  </div>
                )}

                {/* Tags */}
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)] mb-1 block">
                    Tags
                  </label>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="tag1, tag2, tag3"
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)]"
                  />
                </div>

                {/* Human Review Toggle */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="human-review"
                    checked={requiresHumanReview}
                    onChange={(e) => setRequiresHumanReview(e.target.checked)}
                    className="rounded border-[var(--border)] bg-[var(--bg-primary)]"
                  />
                  <label htmlFor="human-review" className="text-sm text-[var(--text-primary)]">
                    Needs human review
                  </label>
                </div>

                {/* Timestamps */}
                <div className="border-t border-[var(--border)] pt-4 space-y-2 text-xs text-[var(--text-muted)]">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    Created: {formatDate(task.created_at)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    Updated: {formatDate(task.updated_at)}
                  </div>
                </div>

                {/* Dependencies Section */}
                <div className="border-t border-[var(--border)] pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-[var(--text-secondary)]" />
                      <span className="text-sm font-medium text-[var(--text-secondary)]">
                        Dependencies
                      </span>
                    </div>
                    <button
                      onClick={() => setPickerOpen(true)}
                      className="p-1 text-[var(--text-muted)] hover:text-[var(--accent-blue)] rounded transition-colors"
                      title="Add dependency (d)"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Depends On */}
                  {dependsOn.length > 0 ? (
                    <div className="mb-4">
                      <span className="text-xs text-[var(--text-muted)] block mb-2">
                        Depends on
                      </span>
                      <div className="space-y-1.5">
                        {dependsOn.map((dep) => (
                          <div
                            key={dep.id}
                            className="flex items-center gap-2 p-2 rounded bg-[var(--bg-primary)] group"
                          >
                            <button
                              onClick={() => handleNavigateToTask(dep.id)}
                              className="flex items-center gap-2 flex-1 text-left min-w-0"
                            >
                              {dep.status === 'done' ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                              ) : (
                                <Circle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                              )}
                              <span className="text-sm text-[var(--text-primary)] line-clamp-1">
                                {dep.title}
                              </span>
                            </button>
                            <button
                              onClick={() => handleRemoveDependency(dep)}
                              disabled={removingDepId === dep.id}
                              className="p-1 text-[var(--text-muted)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                              title="Remove dependency"
                            >
                              {removingDepId === dep.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4">
                      <span className="text-xs text-[var(--text-muted)] block mb-2">
                        Depends on
                      </span>
                      <p className="text-sm text-[var(--text-muted)] italic">
                        No dependencies
                      </p>
                    </div>
                  )}

                  {/* Blocks */}
                  {blocks.length > 0 && (
                    <div>
                      <span className="text-xs text-[var(--text-muted)] block mb-2">
                        Blocking
                      </span>
                      <div className="space-y-1.5">
                        {blocks.map((blocked) => (
                          <button
                            key={blocked.id}
                            onClick={() => handleNavigateToTask(blocked.id)}
                            className="w-full flex items-center gap-2 p-2 rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] transition-colors text-left"
                          >
                            <Link2 className="h-4 w-4 text-[var(--accent-blue)] flex-shrink-0 rotate-45" />
                            <span className="text-sm text-[var(--text-primary)] line-clamp-1 flex-1">
                              {blocked.title}
                            </span>
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor:
                                  blocked.status === 'done' ? '#22c55e' :
                                  blocked.status === 'in_progress' ? '#eab308' :
                                  blocked.status === 'in_review' ? '#a855f7' :
                                  '#3b82f6'
                              }}
                              title={blocked.status}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            </div>
          </Tabs>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-[var(--border)]">
            <div className="flex items-center gap-4">
              {/* Abort & Discard button - only for in_progress tasks */}
              {status === "in_progress" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      disabled={aborting}
                      className="flex items-center gap-2 text-sm text-amber-500 hover:text-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {aborting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <OctagonX className="h-4 w-4" />
                      )}
                      Abort & Discard
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Abort and Discard Task?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure? This will kill the agent session and delete all work.
                        <br /><br />
                        This action will:
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>Terminate the running agent session</li>
                          <li>Delete the worktree and branch</li>
                          <li>Close any open PR</li>
                          <li>Mark the task as done (discarded)</li>
                        </ul>
                        <br />
                        This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleAbort}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        Yes, Abort & Discard
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 text-sm text-red-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-500">Are you sure?</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleDelete}
                  >
                    Delete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !title.trim()}
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Dependency Picker */}
      <DependencyPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        task={task}
        currentProjectId={task.project_id}
        existingDependencyIds={dependsOn.map(d => d.id)}
        onAddDependency={handleAddDependency}
      />
    </>
  )
}
