'use client'

/**
 * TriageCard Component
 * Displays a single blocked task in the triage queue with action buttons
 */

import { useState } from 'react'
import Link from 'next/link'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  CheckCircle,
  RefreshCw,
  GitBranch,
  XCircle,
  AlertTriangle,
  Edit3,
  Save,
  ExternalLink,
  MessageSquare,
  Clock,
  RotateCcw,
  AlertOctagon,
} from 'lucide-react'
import type { TriageTask } from '@/convex/triage'
import { formatDistanceToNow } from '@/lib/utils'
import { ReassignDropdown } from './reassign-dropdown'
import { SplitModal } from './split-modal'

interface TriageCardProps {
  task: TriageTask
  isEscalated?: boolean
}

/**
 * Format duration in human-readable format
 * Examples: "2h 15m", "3 days", "45m"
 */
function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / (1000 * 60))
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return days === 1 ? '1 day' : `${days} days`
  }
  if (hours > 0) {
    const remainingMins = minutes % 60
    return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`
  }
  return `${minutes}m`
}

export function TriageCard({ task, isEscalated = false }: TriageCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedDescription, setEditedDescription] = useState(task.description || '')
  const [showKillDialog, setShowKillDialog] = useState(false)
  const [showEscalateDialog, setShowEscalateDialog] = useState(false)
  const [showUnblockDialog, setShowUnblockDialog] = useState(false)
  const [showSplitModal, setShowSplitModal] = useState(false)
  const [killReason, setKillReason] = useState('')
  const [escalateReason, setEscalateReason] = useState('')

  // Mutations
  const unblockMutation = useMutation(api.triage.triageUnblock)
  const reassignMutation = useMutation(api.triage.triageReassign)
  const splitMutation = useMutation(api.triage.triageSplit)
  const killMutation = useMutation(api.triage.triageKill)
  const escalateMutation = useMutation(api.triage.triageEscalate)

  const handleUnblock = async () => {
    await unblockMutation({ taskId: task.id, actor: 'human' })
    setShowUnblockDialog(false)
  }

  const handleReassign = async (role: string, model?: string) => {
    await reassignMutation({
      taskId: task.id,
      actor: 'human',
      role: role as 'pm' | 'dev' | 'research' | 'reviewer',
      agentModel: model,
    })
  }

  const handleSplit = async (subtasks: { title: string; description?: string; role?: string; priority?: string }[]) => {
    await splitMutation({
      taskId: task.id,
      actor: 'human',
      subtasks: subtasks.map(s => ({
        title: s.title,
        description: s.description,
        role: s.role as 'pm' | 'dev' | 'research' | 'reviewer' | undefined,
        priority: s.priority as 'low' | 'medium' | 'high' | 'urgent' | undefined,
      })),
    })
    setShowSplitModal(false)
  }

  const handleKill = async () => {
    if (!killReason.trim()) return
    await killMutation({ taskId: task.id, actor: 'human', reason: killReason })
    setShowKillDialog(false)
    setKillReason('')
  }

  const handleEscalate = async () => {
    await escalateMutation({
      taskId: task.id,
      actor: 'human',
      reason: escalateReason || undefined,
    })
    setShowEscalateDialog(false)
    setEscalateReason('')
  }

  const handleEditSave = async () => {
    // Update task description and unblock
    await unblockMutation({ taskId: task.id, actor: 'human' })
    // Note: Description update would need a separate mutation or we update the task directly
    // For now, we just unblock after editing
    setIsEditing(false)
  }

  // Build board link
  const boardUrl = `/projects/${task.project_id}?task=${task.id}`

  // Build session link if available
  const sessionUrl = task.agent_session_key
    ? `/sessions/${encodeURIComponent(task.agent_session_key)}`
    : null

  return (
    <>
      <Card
        className={`relative ${
          isEscalated
            ? 'border-orange-500 border-2 shadow-md'
            : 'border-border'
        }`}
      >
        {/* Escalated indicator */}
        {isEscalated && (
          <div className="absolute -top-3 left-4 bg-orange-500 text-white text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
            <AlertOctagon className="h-3 w-3" />
            Escalated
          </div>
        )}

        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Title with link to board */}
              <Link
                href={boardUrl}
                className="text-lg font-semibold hover:text-primary hover:underline line-clamp-2"
                target="_blank"
              >
                {task.title}
              </Link>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {/* Project badge */}
                <Badge variant="outline" className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: task.projectColor }}
                  />
                  {task.projectName}
                </Badge>

                {/* Time blocked */}
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(task.timeBlockedMs)}
                </Badge>

                {/* Retry count */}
                {task.agent_retry_count ? (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <RotateCcw className="h-3 w-3" />
                    {task.agent_retry_count} retries
                  </Badge>
                ) : null}

                {/* Auto-triage count */}
                {(task as unknown as { auto_triage_count?: number }).auto_triage_count ? (
                  <Badge variant="outline" className="flex items-center gap-1 text-amber-600">
                    <RefreshCw className="h-3 w-3" />
                    Auto: {(task as unknown as { auto_triage_count: number }).auto_triage_count}
                  </Badge>
                ) : null}

                {/* Session link */}
                {sessionUrl && (
                  <Link
                    href={sessionUrl}
                    target="_blank"
                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Session
                  </Link>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Blocker comment */}
          {task.blockerComment && (
            <div className="bg-muted rounded-md p-3">
              <div className="flex items-start gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground mb-1">
                    Blocked {formatDistanceToNow(task.blockerComment.created_at)}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">
                    {task.blockerComment.content}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Edit form */}
          {isEditing && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Edit description:</label>
              <Textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                rows={4}
                placeholder="Task description..."
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleEditSave}>
                  <Save className="h-4 w-4 mr-1" />
                  Save & Unblock
                </Button>
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {!isEditing && (
            <div className="flex flex-wrap gap-2">
              {/* Unblock - green */}
              <Button
                size="sm"
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => setShowUnblockDialog(true)}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Unblock
              </Button>

              {/* Reassign - blue */}
              <ReassignDropdown
                currentRole={task.role || undefined}
                onReassign={handleReassign}
              />

              {/* Edit & Retry - yellow */}
              <Button
                size="sm"
                variant="outline"
                className="border-amber-500 text-amber-700 hover:bg-amber-50"
                onClick={() => setIsEditing(true)}
              >
                <Edit3 className="h-4 w-4 mr-1" />
                Edit & Retry
              </Button>

              {/* Split - purple */}
              <Button
                size="sm"
                variant="outline"
                className="border-purple-500 text-purple-700 hover:bg-purple-50"
                onClick={() => setShowSplitModal(true)}
              >
                <GitBranch className="h-4 w-4 mr-1" />
                Split
              </Button>

              {/* Kill - red */}
              <Button
                size="sm"
                variant="outline"
                className="border-red-500 text-red-700 hover:bg-red-50"
                onClick={() => setShowKillDialog(true)}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Kill
              </Button>

              {/* Escalate - orange */}
              {!isEscalated && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-orange-500 text-orange-700 hover:bg-orange-50"
                  onClick={() => setShowEscalateDialog(true)}
                >
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  Escalate
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unblock confirmation dialog */}
      <AlertDialog open={showUnblockDialog} onOpenChange={setShowUnblockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unblock Task</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the task back to &quot;ready&quot; status and reset its retry count.
              The work loop will pick it up again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnblock} className="bg-green-600 hover:bg-green-700">
              Unblock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Kill confirmation dialog */}
      <AlertDialog open={showKillDialog} onOpenChange={setShowKillDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kill Task</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the task to &quot;backlog&quot;. Please provide a reason:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={killReason}
            onChange={(e) => setKillReason(e.target.value)}
            placeholder="Reason for killing this task..."
            className="my-4"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleKill}
              disabled={!killReason.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              Kill Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Escalate confirmation dialog */}
      <AlertDialog open={showEscalateDialog} onOpenChange={setShowEscalateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Escalate Task</AlertDialogTitle>
            <AlertDialogDescription>
              This will flag the task for urgent human attention and create a notification.
              You can optionally provide a reason:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={escalateReason}
            onChange={(e) => setEscalateReason(e.target.value)}
            placeholder="Optional reason for escalation..."
            className="my-4"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEscalate}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Escalate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Split modal */}
      <SplitModal
        open={showSplitModal}
        onClose={() => setShowSplitModal(false)}
        onConfirm={handleSplit}
        originalTask={task}
      />
    </>
  )
}
