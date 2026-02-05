"use client"

import { Draggable } from "@hello-pangea/dnd"
import type { Task } from "@/lib/db/types"
import { useSingleSessionStatus, getSessionStatusIndicator } from "@/lib/hooks/use-session-status"

interface TaskCardProps {
  task: Task
  index: number
  onClick: () => void
  isMobile?: boolean
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "#52525b",
  medium: "#3b82f6",
  high: "#f97316",
  urgent: "#ef4444",
}

const ROLE_COLORS: Record<string, string> = {
  pm: "#a855f7",
  dev: "#3b82f6",
  qa: "#22c55e",
  research: "#f97316",
  security: "#ef4444",
}

const ROLE_LABELS: Record<string, string> = {
  pm: "PM",
  dev: "Dev",
  qa: "QA",
  research: "Research",
  security: "Sec",
}

export function TaskCard({ task, index, onClick, isMobile = false }: TaskCardProps) {
  // Get session status for in-progress tasks
  const shouldFetchSessionStatus = task.status === 'in_progress' && task.session_id
  const { sessionStatus } = useSingleSessionStatus(shouldFetchSessionStatus ? task.session_id || undefined : undefined)
  const sessionIndicator = getSessionStatusIndicator(sessionStatus || undefined)

  const tags = (() => {
    if (!task.tags) return []
    try {
      const parsed = JSON.parse(task.tags)
      // Handle double-encoded JSON strings
      if (typeof parsed === 'string') {
        return JSON.parse(parsed) as string[]
      }
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })()
  
  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg cursor-pointer transition-all ${
            isMobile ? "p-4 touch-manipulation" : "p-3"
          } ${
            snapshot.isDragging
              ? "shadow-2xl rotate-2 opacity-90 border-[var(--accent-blue)]"
              : "hover:border-[var(--accent-blue)]"
          }`}
        >
          {/* Short ID */}
          <div className="mb-2">
            <span 
              className="text-xs text-[var(--text-muted)] font-mono cursor-pointer hover:text-[var(--accent-blue)] transition-colors select-all"
              title="Click to copy ID"
              onClick={(e) => {
                e.stopPropagation()
                navigator.clipboard.writeText(task.id.substring(0, 8))
              }}
            >
              #{task.id.substring(0, 8)}
            </span>
          </div>
          
          {/* Title */}
          <div className="flex items-start gap-2">
            <div 
              className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
              style={{ backgroundColor: PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium }}
              title={`Priority: ${task.priority}`}
            />
            <span className="text-sm text-[var(--text-primary)] line-clamp-2 flex-1">
              {task.title}
            </span>
            {/* Session status indicator for in-progress tasks */}
            {task.status === 'in_progress' && (
              <div 
                className="flex-shrink-0 text-sm cursor-help"
                style={{ color: sessionIndicator.color }}
                title={sessionIndicator.title}
                onClick={(e) => {
                  e.stopPropagation()
                  // TODO: Could open session detail view here
                }}
              >
                {sessionIndicator.emoji}
              </div>
            )}
          </div>
          
          {/* Tags + Assignee */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {tags.slice(0, 2).map((tag) => (
              <span 
                key={tag}
                className="px-1.5 py-0.5 text-xs rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
              >
                {tag}
              </span>
            ))}
            {tags.length > 2 && (
              <span className="text-xs text-[var(--text-muted)]">
                +{tags.length - 2}
              </span>
            )}

            {task.role && task.role !== "any" && (
              <span 
                className="px-1.5 py-0.5 text-xs rounded font-medium text-white"
                style={{ backgroundColor: ROLE_COLORS[task.role] || "#52525b" }}
                title={`Role: ${ROLE_LABELS[task.role] || task.role}`}
              >
                {ROLE_LABELS[task.role] || task.role}
              </span>
            )}

            {task.assignee && (
              <div 
                className="ml-auto w-6 h-6 rounded-full bg-[var(--accent-purple)] flex items-center justify-center text-xs text-white font-medium"
                title={task.assignee}
              >
                {task.assignee.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  )
}
