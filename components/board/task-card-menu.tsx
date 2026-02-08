"use client"

import { useState, useCallback } from "react"
import { MoreVertical, ArrowUp, ArrowDown, Pencil, Trash2, Check } from "lucide-react"
import type { Task, TaskStatus } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface TaskCardMenuProps {
  task: Task
  projectId: string
  columnTasks: Task[]
  onEdit: () => void
  onTaskDeleted?: () => void
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  in_review: "In Review",
  blocked: "Blocked",
  done: "Done",
}

const STATUS_ORDER: TaskStatus[] = ["backlog", "ready", "in_progress", "in_review", "blocked", "done"]

export function TaskCardMenu({ task, projectId, columnTasks, onEdit, onTaskDeleted }: TaskCardMenuProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleMoveToTop = useCallback(async () => {
    if (task.position === 0) return

    try {
      const response = await fetch("/api/tasks/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          status: task.status,
          task_id: task.id,
          new_index: 0,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to reorder task")
      }
    } catch (error) {
      console.error("Error moving task to top:", error)
    }
  }, [task.id, task.status, task.position, projectId])

  const handleMoveToBottom = useCallback(async () => {
    const maxIndex = columnTasks.length - 1
    if (task.position >= maxIndex) return

    try {
      const response = await fetch("/api/tasks/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          status: task.status,
          task_id: task.id,
          new_index: maxIndex,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to reorder task")
      }
    } catch (error) {
      console.error("Error moving task to bottom:", error)
    }
  }, [task.id, task.status, task.position, columnTasks.length, projectId])

  const handleStatusChange = useCallback(async (newStatus: TaskStatus) => {
    if (task.status === newStatus) return

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) {
        throw new Error("Failed to update task status")
      }
    } catch (error) {
      console.error("Error changing task status:", error)
    }
  }, [task.id, task.status])

  const handleDelete = useCallback(async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete task")
      }

      onTaskDeleted?.()
    } catch (error) {
      console.error("Error deleting task:", error)
    } finally {
      setIsDeleting(false)
      setIsDeleteDialogOpen(false)
    }
  }, [task.id, onTaskDeleted])

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--bg-tertiary)]"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4 text-[var(--text-muted)]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {/* Position Operations */}
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleMoveToTop() }}>
            <ArrowUp className="h-4 w-4 mr-2" />
            Move to top
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleMoveToBottom() }}>
            <ArrowDown className="h-4 w-4 mr-2" />
            Move to bottom
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Status Operations */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span className="mr-2">Move to</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {STATUS_ORDER.map((status) => (
                <DropdownMenuItem
                  key={status}
                  disabled={task.status === status}
                  onClick={(e) => { e.stopPropagation(); handleStatusChange(status) }}
                >
                  {task.status === status && <Check className="h-4 w-4 mr-2" />}
                  <span className={task.status === status ? "text-[var(--text-muted)]" : ""}>
                    {STATUS_LABELS[status]}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          {/* Edit */}
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit() }}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>

          {/* Delete */}
          <DropdownMenuItem
            variant="destructive"
            onClick={(e) => { e.stopPropagation(); setIsDeleteDialogOpen(true) }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{task.title}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
