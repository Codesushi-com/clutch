'use client'

/**
 * SplitModal Component
 * Modal for splitting a blocked task into subtasks
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import type { TriageTask } from '@/convex/triage'

interface SubtaskForm {
  id: string
  title: string
  description: string
  role: string
  priority: string
}

interface SplitModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (subtasks: { title: string; description?: string; role?: string; priority?: string }[]) => void
  originalTask: TriageTask
}

const ROLES = [
  { value: 'pm', label: 'Project Manager' },
  { value: 'dev', label: 'Developer' },
  { value: 'research', label: 'Researcher' },
  { value: 'reviewer', label: 'Reviewer' },
]

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

export function SplitModal({ open, onClose, onConfirm, originalTask }: SplitModalProps) {
  const [subtasks, setSubtasks] = useState<SubtaskForm[]>([
    {
      id: '1',
      title: '',
      description: '',
      role: originalTask.role || 'dev',
      priority: originalTask.priority || 'medium',
    },
  ])

  const addSubtask = () => {
    if (subtasks.length >= 5) return
    setSubtasks([
      ...subtasks,
      {
        id: Math.random().toString(36).substr(2, 9),
        title: '',
        description: '',
        role: originalTask.role || 'dev',
        priority: originalTask.priority || 'medium',
      },
    ])
  }

  const removeSubtask = (id: string) => {
    if (subtasks.length <= 1) return
    setSubtasks(subtasks.filter((s) => s.id !== id))
  }

  const updateSubtask = (id: string, updates: Partial<SubtaskForm>) => {
    setSubtasks(subtasks.map((s) => (s.id === id ? { ...s, ...updates } : s)))
  }

  const handleConfirm = () => {
    // Filter out empty titles
    const validSubtasks = subtasks
      .filter((s) => s.title.trim())
      .map((s) => ({
        title: s.title.trim(),
        description: s.description.trim() || undefined,
        role: s.role as 'pm' | 'dev' | 'research' | 'reviewer' | undefined,
        priority: s.priority as 'low' | 'medium' | 'high' | 'urgent' | undefined,
      }))

    if (validSubtasks.length === 0) return
    onConfirm(validSubtasks)
    // Reset form
    setSubtasks([
      {
        id: '1',
        title: '',
        description: '',
        role: originalTask.role || 'dev',
        priority: originalTask.priority || 'medium',
      },
    ])
  }

  const handleCancel = () => {
    onClose()
    // Reset form
    setSubtasks([
      {
        id: '1',
        title: '',
        description: '',
        role: originalTask.role || 'dev',
        priority: originalTask.priority || 'medium',
      },
    ])
  }

  const isValid = subtasks.some((s) => s.title.trim())
  const canAddMore = subtasks.length < 5

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Split Task</DialogTitle>
          <DialogDescription>
            Split &quot;{originalTask.title}&quot; into smaller subtasks. The original task will be marked as done.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800">
              This will mark the original task as complete and create {subtasks.filter(s => s.title.trim()).length || 1} new subtask(s).
            </p>
          </div>

          {/* Subtask forms */}
          <div className="space-y-4">
            {subtasks.map((subtask, index) => (
              <div
                key={subtask.id}
                className="border rounded-lg p-4 space-y-4 bg-muted/30"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Subtask {index + 1}</h4>
                  {subtasks.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => removeSubtask(subtask.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="space-y-3">
                  {/* Title */}
                  <div className="space-y-1.5">
                    <Label htmlFor={`title-${subtask.id}`}>Title *</Label>
                    <Input
                      id={`title-${subtask.id}`}
                      value={subtask.title}
                      onChange={(e) =>
                        updateSubtask(subtask.id, { title: e.target.value })
                      }
                      placeholder="Subtask title..."
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <Label htmlFor={`desc-${subtask.id}`}>Description</Label>
                    <Textarea
                      id={`desc-${subtask.id}`}
                      value={subtask.description}
                      onChange={(e) =>
                        updateSubtask(subtask.id, { description: e.target.value })
                      }
                      placeholder="Optional description..."
                      rows={2}
                    />
                  </div>

                  {/* Role & Priority row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`role-${subtask.id}`}>Role</Label>
                      <Select
                        value={subtask.role}
                        onValueChange={(value) =>
                          updateSubtask(subtask.id, { role: value })
                        }
                      >
                        <SelectTrigger id={`role-${subtask.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`priority-${subtask.id}`}>Priority</Label>
                      <Select
                        value={subtask.priority}
                        onValueChange={(value) =>
                          updateSubtask(subtask.id, { priority: value })
                        }
                      >
                        <SelectTrigger id={`priority-${subtask.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map((priority) => (
                            <SelectItem key={priority.value} value={priority.value}>
                              {priority.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add button */}
          {canAddMore && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={addSubtask}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Subtask ({subtasks.length}/5)
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid}
            className="bg-purple-600 hover:bg-purple-700"
          >
            Split Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
