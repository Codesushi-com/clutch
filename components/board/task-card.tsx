"use client"

import type { Task } from "@/lib/db/types"

interface TaskCardProps {
  task: Task
  onClick: () => void
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "#52525b",
  medium: "#3b82f6",
  high: "#f97316",
  urgent: "#ef4444",
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const tags = task.tags ? JSON.parse(task.tags) as string[] : []
  
  return (
    <div
      onClick={onClick}
      className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg p-3 cursor-pointer hover:border-[var(--accent-blue)] transition-colors"
    >
      {/* Title */}
      <div className="flex items-start gap-2">
        <div 
          className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
          style={{ backgroundColor: PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium }}
          title={`Priority: ${task.priority}`}
        />
        <span className="text-sm text-[var(--text-primary)] line-clamp-2">
          {task.title}
        </span>
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
  )
}
