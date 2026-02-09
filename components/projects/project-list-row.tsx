"use client"

import Link from "next/link"
import { Settings, LayoutGrid } from "lucide-react"

interface ProjectStats {
  id: string
  slug: string
  name: string
  description: string | null
  color: string
  task_count: number
  status_counts: {
    backlog: number
    ready: number
    in_progress: number
    in_review: number
    done: number
  }
  active_agents: number
  work_loop_status: string
  last_activity: number
}

interface ProjectListRowProps {
  project: ProjectStats
}

function StatusCount({ count, label, color }: { count: number; label: string; color: string }) {
  if (count === 0) {
    return (
      <span className="text-xs text-[var(--text-muted)] tabular-nums" title={label}>
        {count}
      </span>
    )
  }
  return (
    <span className="text-xs font-medium tabular-nums" style={{ color }} title={label}>
      {count}
    </span>
  )
}

function WorkLoopBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; bg: string; text: string; dot?: string }> = {
    running: { label: "Running", bg: "rgba(34, 197, 94, 0.1)", text: "var(--accent-green)", dot: "var(--accent-green)" },
    paused: { label: "Paused", bg: "rgba(234, 179, 8, 0.1)", text: "var(--accent-yellow)" },
    stopped: { label: "Stopped", bg: "rgba(161, 161, 170, 0.1)", text: "var(--text-muted)" },
    error: { label: "Error", bg: "rgba(239, 68, 68, 0.1)", text: "var(--accent-red)" },
    disabled: { label: "Disabled", bg: "transparent", text: "var(--text-muted)" },
  }
  const cfg = configs[status] ?? configs.disabled

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      {cfg.dot && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            backgroundColor: cfg.dot,
            animation: status === "running" ? "pulse 2s ease-in-out infinite" : undefined,
          }}
        />
      )}
      {cfg.label}
    </span>
  )
}

function ActiveAgentsBadge({ count }: { count: number }) {
  if (count === 0) return null

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: "rgba(59, 130, 246, 0.1)", color: "var(--accent-blue)" }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{
          backgroundColor: "var(--accent-blue)",
          animation: "pulse 2s ease-in-out infinite",
        }}
      />
      {count} agent{count !== 1 ? "s" : ""}
    </span>
  )
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export function ProjectListRow({ project }: ProjectListRowProps) {
  const { status_counts: sc } = project

  return (
    <div className="group flex items-center gap-4 px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--bg-secondary)] transition-colors">
      {/* Color indicator + Name */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: project.color }}
        />
        <div className="min-w-0">
          <Link
            href={`/projects/${project.slug}`}
            prefetch={false}
            className="font-medium text-[var(--text-primary)] hover:text-[var(--accent-blue)] transition-colors truncate block"
          >
            {project.name}
          </Link>
          {project.description && (
            <p className="text-xs text-[var(--text-muted)] truncate mt-0.5 hidden sm:block">
              {project.description}
            </p>
          )}
        </div>
      </div>

      {/* Ticket counts — desktop */}
      <div className="hidden md:flex items-center gap-3 text-xs flex-shrink-0" style={{ minWidth: "180px" }}>
        <span className="flex items-center gap-1" title="Ready">
          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: "var(--accent-blue)" }} />
          <StatusCount count={sc.ready} label="Ready" color="var(--accent-blue)" />
        </span>
        <span className="flex items-center gap-1" title="In Progress">
          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: "var(--accent-yellow)" }} />
          <StatusCount count={sc.in_progress} label="In Progress" color="var(--accent-yellow)" />
        </span>
        <span className="flex items-center gap-1" title="In Review">
          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: "#a78bfa" }} />
          <StatusCount count={sc.in_review} label="In Review" color="#a78bfa" />
        </span>
        <span className="flex items-center gap-1" title="Done">
          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: "var(--accent-green)" }} />
          <StatusCount count={sc.done} label="Done" color="var(--accent-green)" />
        </span>
      </div>

      {/* Ticket counts — mobile compact */}
      <div className="flex md:hidden items-center gap-1.5 text-xs flex-shrink-0">
        <span className="text-[var(--text-muted)]">{project.task_count}</span>
        <span className="text-[var(--text-muted)]">tasks</span>
      </div>

      {/* Active agents */}
      <div className="hidden sm:flex items-center flex-shrink-0" style={{ minWidth: "90px" }}>
        <ActiveAgentsBadge count={project.active_agents} />
      </div>

      {/* Work loop status */}
      <div className="hidden lg:flex items-center flex-shrink-0" style={{ minWidth: "90px" }}>
        <WorkLoopBadge status={project.work_loop_status} />
      </div>

      {/* Last activity */}
      <div className="hidden lg:block text-xs text-[var(--text-muted)] flex-shrink-0 tabular-nums" style={{ minWidth: "70px" }}>
        {timeAgo(project.last_activity)}
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Link
          href={`/projects/${project.slug}/board`}
          prefetch={false}
          className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          title="Board"
        >
          <LayoutGrid className="w-3.5 h-3.5" />
        </Link>
        <Link
          href={`/projects/${project.slug}/settings`}
          prefetch={false}
          className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}
