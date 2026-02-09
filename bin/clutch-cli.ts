#!/usr/bin/env tsx
/**
 * Clutch CLI - Command line interface for Clutch operations
 *
 * Usage:
 *   clutch agents list                           List active agents and their tasks
 *   clutch agents get <session-key>              Get agent detail + last output
 *   clutch sessions list [--active]              List sessions
 *   clutch sessions status                       OpenClaw session status
 *   clutch dispatch pending [--project <slug>]   Show pending dispatch queue
 *   clutch metrics [--project <slug>]            Task metrics / velocity
 *   clutch signals list [--pending]              Pending signals
 *   clutch signals respond <id> "msg"            Respond to a signal
 *   clutch deploy convex [--project <slug>]      Deploy Convex for a project
 *   clutch deploy check [--project <slug>]       Check if convex/ is dirty vs deployed
 */

import { execFileSync } from "node:child_process"
import { ConvexHttpClient } from "convex/browser"
import { api } from "../convex/_generated/api"
import { runConvexDeploy } from "../worker/phases/convex-deploy"

// ============================================
// Types
// ============================================

interface ProjectInfo {
  id: string
  slug: string
  name: string
  local_path?: string | null
  github_repo?: string | null
}

interface Signal {
  id: string
  task_id: string
  session_key: string
  agent_id: string
  kind: "question" | "blocker" | "alert" | "fyi"
  severity: "normal" | "high" | "critical"
  message: string
  blocking: number
  responded_at: number | null
  response: string | null
  created_at: number
}

interface PendingDispatch {
  task: {
    id: string
    title: string
    status: string
    role: string | null
  }
  project: {
    id: string
    slug: string
    name: string
  }
  agent: {
    id: string
    name: string
    model: string
    role: string
  }
  label: string
}

interface Task {
  id: string
  project_id: string
  title: string
  description: string | null
  status: "backlog" | "ready" | "in_progress" | "in_review" | "blocked" | "done"
  priority: "low" | "medium" | "high" | "urgent"
  role: "pm" | "dev" | "research" | "reviewer" | "conflict_resolver" | null
  assignee: string | null
  tags: string | null // JSON array stored as text
  agent_session_key: string | null
  branch: string | null
  pr_number: number | null
  created_at: number
  updated_at: number
  completed_at: number | null
}

// ============================================
// CLI Parser
// ============================================

function parseArgs(): { command: string; args: string[]; flags: Record<string, string | boolean> } {
  const args = process.argv.slice(2)
  const flags: Record<string, string | boolean> = {}
  const positional: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith("--")) {
      const key = arg.slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith("--")) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(arg)
    }
  }

  return { command: positional.join(" "), args: positional, flags }
}

function showHelp(): void {
  console.log(`
OpenClutch CLI - Manage your OpenClutch projects

Usage:
  clutch <command> [options]

Task Commands:
  tasks list [--project <slug>] [--status <status>] [--limit <n>] [--json]
                                      List tasks for a project
  tasks get <id> [--json]             Get task details (id can be short prefix)
  tasks create --project <slug> --title "..." [options]
                                      Create a new task
  tasks update <id> [options]         Update task fields
  tasks move <id> <status>            Move task to a new status

Agent Commands:
  agents list                         List active agents and their tasks
  agents get <session-key>            Get agent detail + last output

Session Commands:
  sessions list [--active]            List sessions (use --active for only active)
  sessions status                     OpenClaw connection status

Dispatch Commands:
  dispatch pending [--project <slug>] Show pending dispatch queue

Metrics Commands:
  metrics [--project <slug>]          Task metrics / velocity

Signal Commands:
  signals list [--pending]            List signals (use --pending for blocking/unresponded)
  signals respond <id> <message>      Respond to a signal

Deploy Commands:
  deploy convex [--project <slug>]    Deploy Convex schema/functions for a project
  deploy check [--project <slug>]     Check if convex/ is dirty vs deployed

Options:
  --project <slug>    Target project slug (defaults to "clutch" or auto-detected)
  --help, -h          Show this help message

Task Create Options:
  --description "..."  Task description (use \\n for newlines)
  --status <status>    Initial status (default: ready)
  --priority <level>   Priority: low/medium/high/urgent (default: medium)
  --role <role>        Role: pm/dev/research/reviewer/conflict_resolver
  --tags <tags>        Comma-separated tags (e.g., "ui,frontend")

Task Update Options:
  --title "..."        New title
  --description "..."  New description (supports \\n for newlines)
  --status <status>    New status
  --priority <level>   New priority
  --role <role>        New role

Examples:
  clutch tasks list                           List tasks for current project
  clutch tasks list --status ready --json     List ready tasks as JSON
  clutch tasks get abc123                     Get task details
  clutch tasks create --title "Fix bug"       Create a task
  clutch tasks move abc123 done               Move task to done
  clutch agents list                          Show all active agents
  clutch agents get agent:main:clutch:dev:abc Get agent details
  clutch sessions list --active               Show only active sessions
  clutch dispatch pending --project trader    Show pending for trader project
  clutch signals list --pending               Show pending signals
  clutch signals respond abc-123 "LGTM"       Respond to a signal
  clutch metrics --project clutch             Show metrics for clutch project
`)
}

// ============================================
// Convex Client
// ============================================

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.CONVEX_URL ?? "http://127.0.0.1:3210"
  return new ConvexHttpClient(convexUrl)
}

// ============================================
// API Client Helper
// ============================================

async function apiGet(path: string, query?: Record<string, string>): Promise<unknown> {
  const baseUrl = process.env.CLUTCH_API_URL ?? "http://localhost:3002"
  const url = new URL(`/api${path}`, baseUrl)
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, value)
    })
  }
  const response = await fetch(url.toString())
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API error ${response.status}: ${error}`)
  }
  return response.json()
}

async function apiPost(path: string, body: unknown): Promise<unknown> {
  const baseUrl = process.env.CLUTCH_API_URL ?? "http://localhost:3002"
  const url = new URL(`/api${path}`, baseUrl)
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API error ${response.status}: ${error}`)
  }
  return response.json()
}

async function apiPatch(path: string, body: unknown): Promise<unknown> {
  const baseUrl = process.env.CLUTCH_API_URL ?? "http://localhost:3002"
  const url = new URL(`/api${path}`, baseUrl)
  const response = await fetch(url.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API error ${response.status}: ${error}`)
  }
  return response.json()
}

// ============================================
// Project Resolution
// ============================================

async function resolveProject(
  convex: ConvexHttpClient,
  slug?: string
): Promise<ProjectInfo | null> {
  // If slug provided, look it up directly
  if (slug) {
    const project = await convex.query(api.projects.getBySlug, { slug })
    return project
  }

  // Try to auto-detect from current directory
  const detectedSlug = detectProjectFromCwd()
  if (detectedSlug) {
    const project = await convex.query(api.projects.getBySlug, { slug: detectedSlug })
    if (project) {
      return project
    }
  }

  // Fall back to "clutch" project
  const clutchProject = await convex.query(api.projects.getBySlug, { slug: "clutch" })
  if (clutchProject) {
    return clutchProject
  }

  // Last resort: return first project with local_path
  const allProjects = await convex.query(api.projects.getAll, {})
  const withPath = allProjects.find((p: ProjectInfo) => p.local_path)
  return withPath ?? null
}

/**
 * Try to detect project slug from current working directory.
 * Looks for patterns like /path/to/project-name or /path/to/project-name-worktrees/...
 */
function detectProjectFromCwd(): string | null {
  const cwd = process.cwd()

  // Match patterns like:
  // /home/user/src/my-project
  // /home/user/src/my-project-worktrees/fix/abc123
  const match = cwd.match(/[/\\]([^/\\]+?)(?:-worktrees(?:[/\\]|$)|$)/)
  if (match) {
    return match[1]
  }

  // Try to get from git remote
  try {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf-8",
      timeout: 5000,
    })
    const repoMatch = remote.match(/\/([^/]+?)(?:\.git)?\s*$/)
    if (repoMatch) {
      return repoMatch[1]
    }
  } catch {
    // Ignore git errors
  }

  return null
}

// ============================================
// Formatting Helpers
// ============================================

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`
  return `${Math.round(ms / 3600000)}h`
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60000) return "just now"
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`
  return `${Math.round(diff / 86400000)}d ago`
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`
  return `${(tokens / 1000).toFixed(1)}k`
}

/**
 * Unescape literal \n and \t sequences into actual newlines and tabs.
 * This handles shell-escaped strings passed via --description flags.
 */
function unescapeString(str: string): string {
  return str.replace(/\\n/g, "\n").replace(/\\t/g, "\t")
}

// ============================================
// Agent Commands
// ============================================

async function cmdAgentsList(convex: ConvexHttpClient, project: ProjectInfo): Promise<void> {
  console.log(`\nActive agents for project: ${project.slug}\n`)

  // Use sessions table API instead of deprecated tasks.getAgentSessions
  const sessions = await convex.query(api.sessions.getForProject, {
    projectSlug: project.slug,
    limit: 50,
  })

  if (!sessions || sessions.length === 0) {
    console.log("No active agents found.")
    return
  }

  // Header
  console.log("Session Key                          Status   Model              Task ID            Tokens   Age")
  console.log("-".repeat(120))

  for (const session of sessions) {
    const statusIcon = session.status === "active" ? "*" : session.status === "idle" ? "~" : "o"
    const shortKey = (session.session_key || session.id).length > 36 
      ? (session.session_key || session.id).slice(0, 33) + "..." 
      : (session.session_key || session.id).padEnd(36)
    const model = (session.model || "unknown").slice(0, 18).padEnd(18)
    const taskId = (session.task_id || "N/A").slice(0, 18).padEnd(18)
    const tokens = formatTokens(session.tokens_total || 0).padStart(6)
    const age = formatTimeAgo(session.updated_at).padStart(8)

    console.log(`${shortKey} ${statusIcon} ${session.status.padEnd(7)} ${model} ${taskId} ${tokens} ${age}`)
  }

  console.log(`\n${sessions.length} session(s) total`)
}

async function cmdAgentsGet(convex: ConvexHttpClient, sessionKey: string): Promise<void> {
  console.log(`\nFetching agent details for: ${sessionKey}\n`)

  // Use sessions table API instead of deprecated tasks.getAllAgentSessions
  const session = await convex.query(api.sessions.get, { sessionKey })

  if (!session) {
    console.error(`Agent with session key "${sessionKey}" not found.`)
    process.exit(1)
  }

  // Get task details if task_id is present
  let taskDetails = null
  if (session.task_id) {
    taskDetails = await convex.query(api.tasks.getById, { id: session.task_id })
  }

  console.log("Agent Session")
  console.log(`  Session Key: ${session.session_key}`)
  console.log(`  Type:        ${session.session_type}`)
  console.log(`  Model:       ${session.model || "unknown"}`)
  console.log(`  Status:      ${session.status}`)
  console.log("")
  console.log("Task")
  console.log(`  ID:          ${session.task_id || "N/A"}`)
  if (taskDetails) {
    console.log(`  Title:       ${taskDetails.task.title || "Untitled"}`)
    console.log(`  Status:      ${taskDetails.task.status || "unknown"}`)
  }
  console.log("")
  console.log("Activity")
  console.log(`  Created:     ${session.created_at ? new Date(session.created_at).toISOString() : "N/A"}`)
  console.log(`  Updated:     ${new Date(session.updated_at).toISOString()}`)
  if (session.completed_at) {
    console.log(`  Completed:   ${new Date(session.completed_at).toISOString()}`)
  }
  console.log("")
  console.log("Tokens")
  console.log(`  Input:       ${formatTokens(session.tokens_input || 0)}`)
  console.log(`  Output:      ${formatTokens(session.tokens_output || 0)}`)
  console.log(`  Total:       ${formatTokens(session.tokens_total || 0)}`)

  // Use output_preview from sessions table instead of agent_output_preview from tasks
  if (session.output_preview) {
    console.log("")
    console.log("Last Output Preview")
    const preview = session.output_preview.slice(0, 500)
    console.log(`  ${preview.replace(/\n/g, "\n  ")}`)
  }
}

// ============================================
// Session Commands
// ============================================

async function cmdSessionsList(flags: Record<string, string | boolean>): Promise<void> {
  const activeOnly = flags.active === true
  console.log(`\n${activeOnly ? "Active" : "All"} sessions:\n`)

  try {
    const result = execFileSync(
      "openclaw",
      ["sessions", "--json", "--active", activeOnly ? "5" : "60"],
      { encoding: "utf-8", timeout: 10000 }
    )
    const data = JSON.parse(result) as { sessions?: Array<{
      key: string
      kind: string
      model: string
      updatedAt: number
      ageMs: number
      inputTokens: number
      outputTokens: number
      totalTokens: number
    }> }

    const sessions = data.sessions ?? []

    if (sessions.length === 0) {
      console.log("No sessions found.")
      return
    }

    // Header
    console.log("Session Key                          Kind       Model              Age        Tokens")
    console.log("-".repeat(100))

    for (const session of sessions) {
      const shortKey = session.key.length > 36 ? session.key.slice(0, 33) + "..." : session.key.padEnd(36)
      const kind = session.kind.padEnd(10)
      const model = (session.model || "unknown").slice(0, 18).padEnd(18)
      const age = formatDuration(session.ageMs).padStart(8)
      const tokens = formatTokens(session.totalTokens || 0).padStart(8)

      console.log(`${shortKey} ${kind} ${model} ${age} ${tokens}`)
    }

    console.log(`\n${sessions.length} session(s) total`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Failed to fetch sessions: ${message}`)
    process.exit(1)
  }
}

async function cmdSessionsStatus(): Promise<void> {
  console.log("\nOpenClaw Session Status:\n")

  try {
    const status = await apiGet("/openclaw/status") as {
      status: string
      connected: boolean
      wsUrl: string
    }

    const statusIcon = status.connected ? "*" : "o"

    console.log(`Connection:   ${statusIcon} ${status.status}`)
    console.log(`WebSocket:    ${status.wsUrl}`)
    console.log(`Connected:    ${status.connected ? "Yes" : "No"}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Failed to get status: ${message}`)
    process.exit(1)
  }
}

// ============================================
// Dispatch Commands
// ============================================

async function cmdDispatchPending(project?: ProjectInfo): Promise<void> {
  console.log(`\nPending dispatch queue${project ? ` for ${project.slug}` : ""}:\n`)

  try {
    const query: Record<string, string> = {}
    if (project) {
      query.projectId = project.id
    }

    const result = await apiGet("/dispatch/pending", query) as {
      count: number
      pending: PendingDispatch[]
    }

    if (result.count === 0) {
      console.log("No pending dispatches.")
      return
    }

    // Header
    console.log("Task ID            Project      Agent                Role       Title")
    console.log("-".repeat(100))

    for (const item of result.pending) {
      const taskId = item.task.id.slice(0, 18).padEnd(18)
      const projectSlug = item.project.slug.slice(0, 12).padEnd(12)
      const agentName = item.agent.name.slice(0, 20).padEnd(20)
      const role = (item.task.role || "unknown").padEnd(10)
      const title = item.task.title.slice(0, 40)

      console.log(`${taskId} ${projectSlug} ${agentName} ${role} ${title}`)
    }

    console.log(`\n${result.count} pending dispatch(es)`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Failed to fetch pending dispatches: ${message}`)
    process.exit(1)
  }
}

// ============================================
// Metrics Commands
// ============================================

async function cmdMetrics(convex: ConvexHttpClient, project?: ProjectInfo): Promise<void> {
  console.log(`\nTask metrics${project ? ` for ${project.slug}` : " (all projects)"}:\n`)

  // Get cost summary
  const costSummary = await convex.query(api.analytics.costSummary, {
    projectId: project?.id,
    timeRange: "7d",
  })

  // Get cycle times
  const cycleTimes = await convex.query(api.analytics.cycleTimes, {
    projectId: project?.id,
    timeRange: "7d",
  })

  // Get success rate
  const successRate = await convex.query(api.analytics.successRate, {
    projectId: project?.id,
    timeRange: "7d",
  })

  // Get throughput
  const throughput = await convex.query(api.analytics.throughput, {
    projectId: project?.id,
    timeRange: "7d",
  })

  // Display cost summary
  console.log("Cost Summary (7 days)")
  console.log(`  Total:       $${costSummary.totalCost.toFixed(2)}`)
  console.log(`  Per Task:    $${costSummary.averageCostPerTask.toFixed(2)} avg`)
  console.log(`  Tasks:       ${costSummary.totalTasks}`)
  console.log("")
  console.log("By Role")
  for (const [role, data] of Object.entries(costSummary.byRole)) {
    if (data.count > 0) {
      console.log(`  ${role.padEnd(12)} ${data.count.toString().padStart(4)} tasks  $${data.cost.toFixed(2).padStart(8)}`)
    }
  }

  // Display cycle times
  if (cycleTimes.total.average > 0) {
    console.log("")
    console.log("Cycle Times (created -> completed)")
    console.log(`  Average:     ${formatDuration(cycleTimes.total.average)}`)
    console.log(`  Median:      ${formatDuration(cycleTimes.total.median)}`)
    console.log(`  P90:         ${formatDuration(cycleTimes.total.p90)}`)
  }

  // Display success rate
  console.log("")
  console.log("Success Rate")
  console.log(`  Success:    ${successRate.success.count} (${successRate.success.percentage}%)`)
  console.log(`  Struggled:  ${successRate.struggled.count} (${successRate.struggled.percentage}%)`)
  console.log(`  Failed:     ${successRate.failed.count} (${successRate.failed.percentage}%)`)

  // Display throughput
  if (throughput.length > 0) {
    console.log("")
    console.log("Throughput (last 7 days)")
    const totalCompleted = throughput.reduce((sum, day) => sum + day.count, 0)
    const totalCost = throughput.reduce((sum, day) => sum + day.cost, 0)
    console.log(`  Total:       ${totalCompleted} tasks`)
    console.log(`  Cost:        $${totalCost.toFixed(2)}`)
    console.log(`  Daily Avg:   ${(totalCompleted / throughput.length).toFixed(1)} tasks`)
  }
}

// ============================================
// Signal Commands
// ============================================

async function cmdSignalsList(convex: ConvexHttpClient, pendingOnly: boolean): Promise<void> {
  console.log(`\n${pendingOnly ? "Pending" : "All"} signals:\n`)

  const result = await convex.query(api.signals.getAll, {
    onlyBlocking: pendingOnly,
    onlyUnresponded: pendingOnly,
    limit: 50,
  })

  const signals = result.signals as Signal[]

  if (signals.length === 0) {
    console.log("No signals found.")
    return
  }

  // Header
  console.log("ID                   Kind     Severity  Blocking  Task ID              Age       Message")
  console.log("-".repeat(130))

  for (const signal of signals) {
    const id = signal.id.slice(0, 20).padEnd(20)
    const kind = signal.kind.padEnd(8)
    const severity = signal.severity.padEnd(9)
    const blocking = signal.blocking ? "YES" : "NO"
    const taskId = signal.task_id.slice(0, 20).padEnd(20)
    const age = formatTimeAgo(signal.created_at).padStart(9)
    const message = signal.message.slice(0, 40).replace(/\n/g, " ")

    console.log(`${id} ${kind} ${severity} ${blocking.padEnd(9)} ${taskId} ${age} ${message}`)
  }

  if (pendingOnly) {
    console.log(`\n${result.pendingCount} pending signal(s) total`)
  } else {
    console.log(`\n${signals.length} signal(s) shown`)
  }
}

async function cmdSignalsRespond(signalId: string, message: string): Promise<void> {
  console.log(`\nResponding to signal ${signalId}...\n`)

  try {
    await apiPatch(`/tasks/${signalId}/respond`, { response: message })
    console.log("* Response sent successfully")
  } catch {
    // Try the signals API endpoint if task endpoint fails
    try {
      await apiPost("/signal/respond", { signalId, response: message })
      console.log("* Response sent successfully")
    } catch (error2) {
      const message2 = error2 instanceof Error ? error2.message : String(error2)
      console.error(`Failed to respond to signal: ${message2}`)
      process.exit(1)
    }
  }
}

// ============================================
// Deploy Commands
// ============================================

async function cmdDeployConvex(project: ProjectInfo): Promise<void> {
  if (!project.local_path) {
    console.error(`Error: Project "${project.slug}" has no local_path configured`)
    process.exit(1)
  }

  console.log(`Deploying Convex for project: ${project.slug}`)
  console.log(`Working directory: ${project.local_path}`)

  const result = runConvexDeploy(project)

  if (result.success) {
    console.log("* Convex deploy succeeded")
    console.log(result.output)
    process.exit(0)
  } else {
    console.error("x Convex deploy failed")
    console.error(result.output)
    process.exit(1)
  }
}

async function cmdDeployCheck(
  convex: ConvexHttpClient,
  project: ProjectInfo
): Promise<void> {
  if (!project.local_path) {
    console.error(`Error: Project "${project.slug}" has no local_path configured`)
    process.exit(1)
  }

  if (!project.github_repo) {
    console.error(`Error: Project "${project.slug}" has no github_repo configured`)
    process.exit(1)
  }

  console.log(`Checking convex/ status for project: ${project.slug}`)

  // Get the latest deployed version info
  // We use git to check if convex/ files differ between HEAD and origin/main
  try {
    const diffOutput = execFileSync(
      "git",
      ["diff", "--name-only", "origin/main...HEAD"],
      {
        encoding: "utf-8",
        timeout: 10000,
        cwd: project.local_path,
      }
    )

    const files = diffOutput.split("\n").filter((f) => f.trim().length > 0)
    const convexFiles = files.filter((f) => f.startsWith("convex/"))

    if (convexFiles.length === 0) {
      console.log("* convex/ directory is clean (no changes since origin/main)")
      console.log("\nNote: This only checks committed changes. Uncommitted changes are not detected.")
      process.exit(0)
    }

    console.log(`x convex/ has ${convexFiles.length} changed file(s) not on origin/main:`)
    for (const file of convexFiles) {
      console.log(`  - ${file}`)
    }
    console.log("\nRun 'clutch deploy convex' to deploy these changes.")
    process.exit(1)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Error checking convex/ status: ${message}`)
    process.exit(1)
  }
}

// ============================================
// Task Commands
// ============================================

const VALID_STATUSES = ["backlog", "ready", "in_progress", "in_review", "blocked", "done"] as const
const VALID_PRIORITIES = ["low", "medium", "high", "urgent"] as const
const VALID_ROLES = ["pm", "dev", "research", "reviewer", "conflict_resolver"] as const

async function resolveTaskByPrefix(
  convex: ConvexHttpClient,
  projectId: string,
  idOrPrefix: string
): Promise<Task | null> {
  // If it's a full UUID (36 chars with dashes), use it directly
  if (idOrPrefix.length === 36 && idOrPrefix.includes("-")) {
    const result = await convex.query(api.tasks.getById, { id: idOrPrefix })
    return result?.task ?? null
  }

  // Otherwise, search by prefix
  const tasks = await convex.query(api.tasks.getByProject, { projectId })
  const match = tasks.find((t: Task) => t.id.startsWith(idOrPrefix))
  return match ?? null
}

async function cmdTasksList(
  convex: ConvexHttpClient,
  project: ProjectInfo,
  flags: Record<string, string | boolean>
): Promise<void> {
  const status = typeof flags.status === "string" ? flags.status : undefined
  const limit = typeof flags.limit === "string" ? parseInt(flags.limit, 10) : undefined
  const jsonOutput = flags.json === true

  const tasks = await convex.query(api.tasks.getByProject, {
    projectId: project.id,
    status: status as Task["status"] | undefined,
  })

  const limitedTasks = limit && !isNaN(limit) ? tasks.slice(0, limit) : tasks

  if (jsonOutput) {
    console.log(JSON.stringify({ tasks: limitedTasks, project: project.slug }, null, 2))
    return
  }

  if (limitedTasks.length === 0) {
    console.log(`\nNo tasks found for project: ${project.slug}${status ? ` (status: ${status})` : ""}`)
    return
  }

  console.log(`\nTasks for project: ${project.slug}${status ? ` (status: ${status})` : ""}\n`)

  // Header
  console.log("ID (short)  Title                           Status       Priority  Role       Age")
  console.log("-".repeat(90))

  for (const task of limitedTasks) {
    const shortId = task.id.slice(0, 8).padEnd(10)
    const title = (task.title || "Untitled").slice(0, 30).padEnd(31)
    const taskStatus = task.status.padEnd(12)
    const priority = task.priority.padEnd(8)
    const role = (task.role || "-").padEnd(10)
    const age = formatTimeAgo(task.created_at).padStart(8)

    console.log(`${shortId} ${title} ${taskStatus} ${priority} ${role} ${age}`)
  }

  console.log(`\n${limitedTasks.length} task(s) shown`)
}

async function cmdTasksGet(
  convex: ConvexHttpClient,
  project: ProjectInfo,
  idOrPrefix: string,
  flags: Record<string, string | boolean>
): Promise<void> {
  const jsonOutput = flags.json === true

  const task = await resolveTaskByPrefix(convex, project.id, idOrPrefix)

  if (!task) {
    console.error(`Task "${idOrPrefix}" not found in project ${project.slug}`)
    process.exit(1)
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ task }, null, 2))
    return
  }

  console.log(`\nTask Details\n`)
  console.log(`ID:          ${task.id}`)
  console.log(`Title:       ${task.title}`)
  console.log(`Status:      ${task.status}`)
  console.log(`Priority:    ${task.priority}`)
  console.log(`Role:        ${task.role || "-"}`)
  console.log(`Assignee:    ${task.assignee || "-"}`)

  if (task.tags) {
    try {
      const tags = JSON.parse(task.tags)
      console.log(`Tags:        ${tags.join(", ")}`)
    } catch {
      console.log(`Tags:        ${task.tags}`)
    }
  }

  console.log(``)
  console.log(`Agent:       ${task.agent_session_key || "-"}`)
  console.log(`Branch:      ${task.branch || "-"}`)
  console.log(`PR Number:   ${task.pr_number || "-"}`)

  console.log(``)
  console.log(`Created:     ${new Date(task.created_at).toISOString()}`)
  console.log(`Updated:     ${new Date(task.updated_at).toISOString()}`)
  if (task.completed_at) {
    console.log(`Completed:   ${new Date(task.completed_at).toISOString()}`)
  }

  if (task.description) {
    console.log(``)
    console.log(`Description:`)
    const lines = task.description.split("\n")
    for (const line of lines.slice(0, 20)) {
      console.log(`  ${line}`)
    }
    if (lines.length > 20) {
      console.log(`  ... (${lines.length - 20} more lines)`)
    }
  }
}

async function cmdTasksCreate(
  convex: ConvexHttpClient,
  project: ProjectInfo,
  flags: Record<string, string | boolean>
): Promise<void> {
  const title = typeof flags.title === "string" ? flags.title : undefined

  if (!title) {
    console.error("Error: --title is required")
    process.exit(1)
  }

  const description = typeof flags.description === "string" ? unescapeString(flags.description) : undefined
  const status = (typeof flags.status === "string" ? flags.status : "ready") as Task["status"]
  const priority = (typeof flags.priority === "string" ? flags.priority : "medium") as Task["priority"]
  const role = typeof flags.role === "string" ? flags.role : undefined

  // Validate status
  if (!VALID_STATUSES.includes(status)) {
    console.error(`Error: Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(", ")}`)
    process.exit(1)
  }

  // Validate priority
  if (!VALID_PRIORITIES.includes(priority)) {
    console.error(`Error: Invalid priority "${priority}". Must be one of: ${VALID_PRIORITIES.join(", ")}`)
    process.exit(1)
  }

  // Validate role
  if (role && !VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
    console.error(`Error: Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}`)
    process.exit(1)
  }

  // Parse tags
  let tags: string | undefined
  if (typeof flags.tags === "string") {
    const tagList = flags.tags.split(",").map((t) => t.trim()).filter(Boolean)
    tags = JSON.stringify(tagList)
  }

  const result = await apiPost("/tasks", {
    project_id: project.id,
    title,
    description,
    status,
    priority,
    role,
    tags,
  }) as { task: Task }

  if (flags.json === true) {
    console.log(JSON.stringify({ task: result.task }, null, 2))
  } else {
    console.log(result.task.id)
  }
}

async function cmdTasksUpdate(
  convex: ConvexHttpClient,
  project: ProjectInfo,
  idOrPrefix: string,
  flags: Record<string, string | boolean>
): Promise<void> {
  const task = await resolveTaskByPrefix(convex, project.id, idOrPrefix)

  if (!task) {
    console.error(`Task "${idOrPrefix}" not found in project ${project.slug}`)
    process.exit(1)
  }

  const updates: Record<string, unknown> = {}
  const updatedFields: string[] = []

  if (typeof flags.title === "string") {
    updates.title = flags.title
    updatedFields.push(`title: "${flags.title}"`)
  }

  if (typeof flags.description === "string") {
    updates.description = unescapeString(flags.description)
    updatedFields.push(`description: updated`)
  }

  if (typeof flags.status === "string") {
    if (!VALID_STATUSES.includes(flags.status as typeof VALID_STATUSES[number])) {
      console.error(`Error: Invalid status "${flags.status}". Must be one of: ${VALID_STATUSES.join(", ")}`)
      process.exit(1)
    }
    updates.status = flags.status
    updatedFields.push(`status: ${flags.status}`)
  }

  if (typeof flags.priority === "string") {
    if (!VALID_PRIORITIES.includes(flags.priority as typeof VALID_PRIORITIES[number])) {
      console.error(`Error: Invalid priority "${flags.priority}". Must be one of: ${VALID_PRIORITIES.join(", ")}`)
      process.exit(1)
    }
    updates.priority = flags.priority
    updatedFields.push(`priority: ${flags.priority}`)
  }

  if (typeof flags.role === "string") {
    if (!VALID_ROLES.includes(flags.role as typeof VALID_ROLES[number])) {
      console.error(`Error: Invalid role "${flags.role}". Must be one of: ${VALID_ROLES.join(", ")}`)
      process.exit(1)
    }
    updates.role = flags.role
    updatedFields.push(`role: ${flags.role}`)
  }

  if (Object.keys(updates).length === 0) {
    console.error("Error: No fields to update. Provide at least one of: --title, --description, --status, --priority, --role")
    process.exit(1)
  }

  await apiPatch(`/tasks/${task.id}`, updates)

  console.log(`* Updated task ${task.id.slice(0, 8)}`)
  for (const field of updatedFields) {
    console.log(`  - ${field}`)
  }
}

async function cmdTasksMove(
  convex: ConvexHttpClient,
  project: ProjectInfo,
  idOrPrefix: string,
  newStatus: string
): Promise<void> {
  if (!VALID_STATUSES.includes(newStatus as typeof VALID_STATUSES[number])) {
    console.error(`Error: Invalid status "${newStatus}". Must be one of: ${VALID_STATUSES.join(", ")}`)
    process.exit(1)
  }

  const task = await resolveTaskByPrefix(convex, project.id, idOrPrefix)

  if (!task) {
    console.error(`Task "${idOrPrefix}" not found in project ${project.slug}`)
    process.exit(1)
  }

  await apiPatch(`/tasks/${task.id}`, { status: newStatus })

  console.log(`* Moved task ${task.id.slice(0, 8)} from ${task.status} to ${newStatus}`)
}

// ============================================
// Main Entry Point
// ============================================

async function main(): Promise<void> {
  const { command, flags, args: positional } = parseArgs()

  // Show help
  if (flags.help || flags.h || !command) {
    showHelp()
    process.exit(0)
  }

  // Initialize Convex client
  const convex = getConvexClient()

  // Resolve target project (if needed)
  const needsProject = [
    "agents list", "agents get",
    "tasks list", "tasks get", "tasks create", "tasks update", "tasks move",
    "dispatch pending",
    "metrics",
    "deploy convex", "deploy check"
  ].some(cmd => command.startsWith(cmd))

  let project: ProjectInfo | undefined
  if (needsProject) {
    const projectSlug = typeof flags.project === "string" ? flags.project : undefined
    const resolved = await resolveProject(convex, projectSlug)
    if (!resolved) {
      console.error(
        projectSlug
          ? `Error: Project "${projectSlug}" not found`
          : "Error: Could not determine project. Use --project <slug> to specify."
      )
      process.exit(1)
    }
    project = resolved
  }

  // Route to appropriate command
  switch (true) {
    // Task commands
    case command === "tasks list":
      await cmdTasksList(convex, project!, flags)
      break
    case command.startsWith("tasks get "):
      await cmdTasksGet(convex, project!, positional[2], flags)
      break
    case command === "tasks create":
      await cmdTasksCreate(convex, project!, flags)
      break
    case command.startsWith("tasks update "):
      await cmdTasksUpdate(convex, project!, positional[2], flags)
      break
    case command.startsWith("tasks move "):
      await cmdTasksMove(convex, project!, positional[2], positional[3])
      break

    // Agent commands
    case command === "agents list":
      await cmdAgentsList(convex, project!)
      break
    case command.startsWith("agents get "):
      await cmdAgentsGet(convex, positional[2])
      break

    // Session commands
    case command === "sessions list":
      await cmdSessionsList(flags)
      break
    case command === "sessions status":
      await cmdSessionsStatus()
      break

    // Dispatch commands
    case command === "dispatch pending":
      await cmdDispatchPending(project)
      break

    // Metrics commands
    case command === "metrics":
      await cmdMetrics(convex, project)
      break

    // Signal commands
    case command === "signals list":
      await cmdSignalsList(convex, flags.pending === true)
      break
    case command.startsWith("signals respond "):
      await cmdSignalsRespond(positional[2], positional.slice(3).join(" "))
      break

    // Deploy commands
    case command === "deploy convex":
      await cmdDeployConvex(project!)
      break
    case command === "deploy check":
      await cmdDeployCheck(convex, project!)
      break

    default:
      console.error(`Unknown command: ${command}`)
      console.error("Run 'clutch --help' for usage information.")
      process.exit(1)
  }
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
