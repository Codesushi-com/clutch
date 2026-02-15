"use client"

import { useMemo } from "react"
import { Bot, Monitor } from "lucide-react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useSessions } from "@/lib/hooks/use-sessions"
import { useActiveAgentSessions } from "@/lib/hooks/use-work-loop"
import type { TaskWithAgentSession } from "@/convex/tasks"

interface SessionsAgentsCardProps {
  projectId?: string | null
}

// Role colors matching Observatory
const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  dev: { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30" },
  reviewer: { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/30" },
  qa: { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30" },
  pm: { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30" },
  research: { bg: "bg-cyan-500/20", text: "text-cyan-400", border: "border-cyan-500/30" },
  conflict_resolver: { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30" },
}

function getRoleColor(role: string | null | undefined) {
  return ROLE_COLORS[role || "dev"] || ROLE_COLORS.dev
}

// Format short session ID for display
function formatShortSessionId(sessionKey: string): string {
  // Extract the last part and take first 8 chars
  const parts = sessionKey.split(":")
  const lastPart = parts[parts.length - 1] || sessionKey
  return lastPart.slice(0, 8)
}

// Format session age
function formatSessionAge(timestamp: number | null | undefined): string {
  if (!timestamp) return "unknown"

  const elapsed = Date.now() - timestamp
  const minutes = Math.floor(elapsed / 60000)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m`
  return `${Math.floor(elapsed / 1000)}s`
}

// Agent slot bar component
function AgentSlotBar({ current, max }: { current: number; max: number }) {
  const segments = Array.from({ length: max }, (_, i) => i < current)

  return (
    <div className="flex items-center gap-1">
      {segments.map((filled, i) => (
        <div
          key={i}
          className={`h-2 w-4 rounded-sm transition-colors ${
            filled ? "bg-[var(--accent-green)]" : "bg-[var(--bg-tertiary)]"
          }`}
        />
      ))}
    </div>
  )
}

// Agent list item component
function AgentListItem({ item, projectName }: { item: TaskWithAgentSession; projectName?: string }) {
  const { task, session } = item
  const roleColor = getRoleColor(task.role)
  const age = formatSessionAge(session?.created_at ?? task.agent_spawned_at)
  // Truncate title to ~30 chars
  const shortTitle = task.title.length > 35 ? task.title.slice(0, 32) + "…" : task.title

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded bg-[var(--bg-secondary)]/50 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${roleColor.bg} ${roleColor.text} ${roleColor.border} shrink-0`}>
          {task.role || "dev"}
        </span>
        <div className="min-w-0">
          {projectName && (
            <span className="text-[10px] text-[var(--text-muted)] block">
              {projectName}
            </span>
          )}
          <span className="text-xs text-[var(--text-primary)] truncate block">
            {shortTitle}
          </span>
        </div>
      </div>
      <span className="text-xs text-[var(--text-muted)] shrink-0">
        {age}
      </span>
    </div>
  )
}

export function SessionsAgentsCard({ projectId }: SessionsAgentsCardProps) {
  // Get all sessions for counts
  const { sessions: allSessions, isLoading: sessionsLoading } = useSessions({}, 1000)

  // Get active agent sessions — only query when we have a specific project
  const { data: agentSessions, isLoading: agentsLoading } = useActiveAgentSessions(projectId || null)

  // Project name lookup for global view
  const projects = useQuery(api.projects.getAllWithStats, {})
  const projectNames = useMemo(() => {
    const map: Record<string, string> = {}
    projects?.forEach(p => { map[p.id] = p.name })
    return map
  }, [projects])

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalSessions = allSessions?.length ?? 0
    const activeSessions = allSessions?.filter(s => s.status === "active").length ?? 0

    // Filter to truly active agents (in_progress or in_review tasks)
    const activeAgents = agentSessions?.filter(
      item => item.task.status === "in_progress" || item.task.status === "in_review"
    ) ?? []

    const agentCount = activeAgents.length

    // Role breakdown
    const roleCounts: Record<string, number> = {}
    activeAgents.forEach(({ task }) => {
      const role = task.role || "dev"
      roleCounts[role] = (roleCounts[role] || 0) + 1
    })

    return {
      totalSessions,
      activeSessions,
      agentCount,
      roleCounts,
      activeAgents,
    }
  }, [allSessions, agentSessions])

  const isLoading = sessionsLoading || agentsLoading

  // Global agent limit (from MEMORY.md - global 6, per-project 4, dev 4, reviewer 3)
  const MAX_AGENTS = 6

  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--border)]">
        <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Sessions & Agents
        </h3>
      </div>

      {/* Content */}
      <div className="p-3 space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-8 bg-[var(--bg-secondary)] rounded animate-pulse" />
            <div className="h-6 bg-[var(--bg-secondary)] rounded animate-pulse" />
          </div>
        ) : (
          <>
            {/* Sessions row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-[var(--text-muted)]" />
                <span className="text-sm text-[var(--text-secondary)]">Sessions</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-[var(--text-primary)]">
                  {metrics.activeSessions}
                </span>
                <span className="text-xs text-[var(--text-muted)] ml-1">
                  / {metrics.totalSessions} total
                </span>
              </div>
            </div>

            {/* Agents row */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-[var(--text-muted)]" />
                  <span className="text-sm text-[var(--text-secondary)]">Agents</span>
                </div>
                <div className="flex items-center gap-2">
                  <AgentSlotBar current={metrics.agentCount} max={MAX_AGENTS} />
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {metrics.agentCount}/{MAX_AGENTS}
                  </span>
                </div>
              </div>

              {/* Role breakdown pills */}
              {metrics.agentCount > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(metrics.roleCounts).map(([role, count]) => {
                    const colors = getRoleColor(role)
                    return (
                      <span
                        key={role}
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}
                      >
                        {count} {role}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Per-agent list (if 4 or fewer) */}
            {metrics.agentCount === 0 ? (
              <p className="text-sm text-[var(--text-muted)] italic">
                No active agents
              </p>
            ) : metrics.agentCount <= 4 ? (
              <div className="space-y-1 pt-1">
                {metrics.activeAgents.map(({ task, session }) => (
                  <AgentListItem
                    key={task.id}
                    item={{ task, session }}
                    projectName={!projectId ? projectNames[task.project_id] : undefined}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
