"use client"

import { useState, useEffect } from "react"
import { X, Trash2, Clock, Calendar, MessageSquare, Send, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTaskStore } from "@/lib/stores/task-store"
import { CommentThread } from "./comment-thread"
import { CommentInput } from "./comment-input"
import type { Task, TaskStatus, TaskPriority, TaskRole, Comment, DispatchStatus } from "@/lib/db/types"

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
  { value: "review", label: "Review", color: "#a855f7" },
  { value: "done", label: "Done", color: "#22c55e" },
]

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "#52525b" },
  { value: "medium", label: "Medium", color: "#3b82f6" },
  { value: "high", label: "High", color: "#f97316" },
  { value: "urgent", label: "Urgent", color: "#ef4444" },
]

const ROLES: { value: TaskRole; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "pm", label: "PM" },
  { value: "dev", label: "Dev" },
  { value: "qa", label: "QA" },
  { value: "research", label: "Research" },
  { value: "security", label: "Security" },
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
  const [role, setRole] = useState<TaskRole>("any")
  const [assignee, setAssignee] = useState("")
  const [requiresHumanReview, setRequiresHumanReview] = useState(false)
  const [tags, setTags] = useState("")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Comments state
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  
  // Dispatch state
  const [dispatchStatus, setDispatchStatus] = useState<DispatchStatus | null>(null)
  const [dispatching, setDispatching] = useState(false)
  
  const updateTask = useTaskStore((s) => s.updateTask)
  const deleteTask = useTaskStore((s) => s.deleteTask)

  // Load task data when modal opens
  useEffect(() => {
    if (task && open) {
      setTitle(task.title)
      setDescription(task.description || "")
      setStatus(task.status)
      setPriority(task.priority)
      setRole(task.role || "any")
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
      await updateTask(task.id, {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        role: role === "any" ? null : role,
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
    
    await deleteTask(task.id)
    onDelete?.(task.id)
    onOpenChange(false)
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

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  if (!open || !task) return null

  return (
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
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-transparent text-xl font-semibold text-[var(--text-primary)] border-0 border-b border-transparent hover:border-[var(--border)] focus:border-[var(--accent-blue)] focus:outline-none px-0 py-1 transition-colors"
              placeholder="Task title"
            />
            
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
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex gap-8">
            {/* Main content */}
            <div className="flex-1 space-y-4">
              {/* Description */}
              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] mb-1 block">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description..."
                  className="w-full min-h-[200px] max-h-[400px] bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)] resize-y"
                />
              </div>
              
              {/* Comments Section */}
              <div className="border-t border-[var(--border)] pt-4">
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare className="h-4 w-4 text-[var(--text-secondary)]" />
                  <label className="text-sm font-medium text-[var(--text-secondary)]">
                    Comments ({comments.length})
                  </label>
                </div>
                
                {loadingComments ? (
                  <div className="text-sm text-[var(--text-muted)]">Loading comments...</div>
                ) : (
                  <>
                    <div className="max-h-[500px] overflow-y-auto mb-4">
                      <CommentThread comments={comments} />
                    </div>
                    <CommentInput onSubmit={handleAddComment} />
                  </>
                )}
              </div>
            </div>
            
            {/* Sidebar */}
            <div className="w-64 space-y-4 flex-shrink-0">
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
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-[var(--border)]">
          <div>
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
  )
}
