/**
 * Work Phase
 *
 * Claims ready tasks (respecting dependencies) and spawns appropriately-configured
 * sub-agents to work on them.
 */

import type { ConvexHttpClient } from "convex/browser"
import { api } from "../../convex/_generated/api"
import type { AgentManager } from "../agent-manager"
import type { WorkLoopConfig } from "../config"
import type { LogRunParams } from "../logger"
import type { Task, TaskPriority } from "../../lib/types"
import { buildPromptAsync } from "../prompts"

// ============================================
// Types
// ============================================

export interface WorkPhaseResult {
  claimed: boolean
  taskId?: string
  role?: string
}

interface ProjectInfo {
  id: string
  slug: string
  name: string
  work_loop_enabled: boolean
  work_loop_max_agents?: number | null
  local_path?: string | null
  github_repo?: string | null
}

interface WorkContext {
  convex: ConvexHttpClient
  agents: AgentManager
  config: WorkLoopConfig
  cycle: number
  project: ProjectInfo
  log: (params: LogRunParams) => Promise<void>
}

// ============================================
// Priority Ordering
// ============================================

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

/**
 * Sort tasks by priority (urgent first) then by position
 */
function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return a.position - b.position
  })
}

// ============================================
// Role → Model Mapping
// ============================================

const ROLE_MODEL_MAP: Record<string, string> = {
  pm: "gpt",
  research: "gpt",
  reviewer: "moonshot/kimi-for-coding",
  dev: "moonshot/kimi-for-coding",
}

/**
 * Get the model for a role.
 * Every role must have an explicit model to avoid falling back to the
 * gateway default (which may be an expensive model like Opus).
 */
function getModelForRole(role: string): string {
  return ROLE_MODEL_MAP[role] ?? ROLE_MODEL_MAP.dev
}

// ============================================
// Dependency Checking
// ============================================

/**
 * Check if all dependencies for a task are complete (done)
 */
async function areDependenciesMet(
  convex: ConvexHttpClient,
  taskId: string
): Promise<boolean> {
  try {
    const deps = await convex.query(api.taskDependencies.getIncomplete, { taskId })
    return deps.length === 0
  } catch (error) {
    // If we can't check dependencies, assume they're not met to be safe
    console.error(`[WorkPhase] Failed to check dependencies for ${taskId}:`, error)
    return false
  }
}

// ============================================
// Task Claiming
// ============================================

/**
 * Try to claim a task by moving it to in_progress
 */
async function claimTask(
  convex: ConvexHttpClient,
  taskId: string
): Promise<Task | null> {
  try {
    const result = await convex.mutation(api.tasks.move, {
      id: taskId,
      status: "in_progress",
    })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Check if it's a dependency error
    if (message.includes("dependencies not complete")) {
      return null  // Dependencies not met, this is expected
    }
    // Any other error is unexpected
    console.error(`[WorkPhase] Unexpected error claiming task ${taskId}:`, message)
    return null
  }
}

// ============================================
// SOUL Template Loading (from Convex)
// ============================================
// NOTE: SOUL templates are now loaded from Convex promptVersions.
// See worker/prompt-fetcher.ts for the fetch implementation.
// The buildPromptAsync function handles fetching the SOUL template
// from Convex and combining it with task-specific context.

// ============================================
// Image URL Extraction
// ============================================

/**
 * Extract image URLs from task description
 * Looks for markdown image syntax: ![alt](url) or ![](url)
 * Also detects data URLs and HTTP/HTTPS image URLs
 */
function extractImageUrls(description: string | null): string[] {
  if (!description) return []

  const urls: string[] = []

  // Markdown image syntax: ![alt](url)
  const markdownRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  let match
  while ((match = markdownRegex.exec(description)) !== null) {
    const url = match[2]
    if (url.startsWith('http') || url.startsWith('data:')) {
      urls.push(url)
    }
  }

  // Plain image URLs (http/https)
  const urlRegex = /(https?:\/\/[^\s\"<>]+\.(?:png|jpg|jpeg|gif|webp|svg))/gi
  while ((match = urlRegex.exec(description)) !== null) {
    if (!urls.includes(match[1])) {
      urls.push(match[1])
    }
  }

  // Data URLs
  const dataUrlRegex = /(data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+)/g
  while ((match = dataUrlRegex.exec(description)) !== null) {
    if (!urls.includes(match[1])) {
      urls.push(match[1])
    }
  }

  return urls
}

// ============================================
// Main Work Phase
// ============================================

/**
 * Run the work phase: claim ready tasks and spawn agents
 *
 * Logic:
 * 1. Check capacity limits
 * 2. Query ready tasks, sorted by priority then position
 * 3. For each candidate, check dependencies and try to claim
 * 4. Load role SOUL template and build prompt
 * 5. Spawn sub-agent via ChildManager
 * 6. Log claim and spawn to Convex
 */
export async function runWork(ctx: WorkContext): Promise<WorkPhaseResult> {
  const { convex, agents, config, cycle, project, log } = ctx

  // --- 1. Check capacity ---
  const globalCount = agents.activeCount()
  const projectCount = agents.activeCount(project.id)
  const devCount = agents.activeCountByRole("dev")

  if (globalCount >= config.maxAgentsGlobal) {
    await log({
      projectId: project.id,
      cycle,
      phase: "work",
      action: "capacity_check",
      details: { globalCount, maxGlobal: config.maxAgentsGlobal, reason: "global_limit" },
    })
    return { claimed: false }
  }

  if (projectCount >= config.maxAgentsPerProject) {
    await log({
      projectId: project.id,
      cycle,
      phase: "work",
      action: "capacity_check",
      details: { projectCount, maxPerProject: config.maxAgentsPerProject, reason: "project_limit" },
    })
    return { claimed: false }
  }

  if (devCount >= config.maxDevAgents) {
    await log({
      projectId: project.id,
      cycle,
      phase: "work",
      action: "capacity_check",
      details: { devCount, maxDev: config.maxDevAgents, reason: "dev_limit" },
    })
    return { claimed: false }
  }

  // --- 2. Query ready tasks ---
  let readyTasks: Task[]
  try {
    readyTasks = await convex.query(api.tasks.getByProject, {
      projectId: project.id,
      status: "ready",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await log({
      projectId: project.id,
      cycle,
      phase: "work",
      action: "fetch_failed",
      details: { error: message },
    })
    return { claimed: false }
  }

  if (readyTasks.length === 0) {
    await log({
      projectId: project.id,
      cycle,
      phase: "work",
      action: "no_ready_tasks",
    })
    return { claimed: false }
  }

  // Sort by priority then position
  const sortedTasks = sortTasks(readyTasks)

  await log({
    projectId: project.id,
    cycle,
    phase: "work",
    action: "ready_tasks_found",
    details: { count: sortedTasks.length },
  })

  // --- 3. Try to claim a task ---
  for (const task of sortedTasks) {
    const role = task.role ?? "dev"

    // Check dependencies (before attempting claim)
    const depsMet = await areDependenciesMet(convex, task.id)
    if (!depsMet) {
      await log({
        projectId: project.id,
        cycle,
        phase: "work",
        action: "dependency_blocked",
        taskId: task.id,
        details: { title: task.title },
      })
      continue
    }

    // Try to claim the task
    const claimed = await claimTask(convex, task.id)
    if (!claimed) {
      // Another process claimed it or deps changed
      await log({
        projectId: project.id,
        cycle,
        phase: "work",
        action: "claim_failed",
        taskId: task.id,
        details: { title: task.title },
      })
      continue
    }

    // Successfully claimed!
    await log({
      projectId: project.id,
      cycle,
      phase: "work",
      action: "task_claimed",
      taskId: task.id,
      details: { title: task.title, role },
    })

    // --- 4. Build prompt (fetches SOUL from Convex) ---
    const repoDir = project.local_path!
    const worktreesBase = `${repoDir}-worktrees`
    const worktreeDir = `${worktreesBase}/fix/${task.id.slice(0, 8)}`

    // For PM tasks, fetch any signal Q&A history to include in the prompt
    let signalResponses: Array<{ question: string; response: string }> | undefined
    if (role === "pm") {
      try {
        const signals = await convex.query(api.signals.getByTask, { taskId: task.id })
        signalResponses = signals
          .filter((s) => s.responded_at && s.response)
          .map((s) => ({
            question: s.message,
            response: s.response!,
          }))
      } catch {
        // Non-fatal — proceed without signal context
        signalResponses = undefined
      }
    }

    // Extract image URLs for PM triage tasks
    const imageUrls = role === "pm" ? extractImageUrls(task.description) : undefined

    // Fetch task comments for context (filter out automated status-change noise)
    let comments: Array<{ author: string; content: string; timestamp: string }> | undefined
    try {
      const taskComments = await convex.query(api.comments.getByTask, { taskId: task.id })
      comments = taskComments
        .filter((c) => c.type !== "status_change")  // Skip automated noise
        .map((c) => ({
          author: c.author,
          content: c.content,
          timestamp: new Date(c.created_at).toISOString(),
        }))
    } catch {
      // Non-fatal — proceed without comment context
      comments = undefined
    }

    // Fetch prompt from Convex (single source of truth)
    // Errors loudly if no active prompt version exists for the role
    let prompt: string
    try {
      prompt = await buildPromptAsync({
        role,
        taskId: task.id,
        taskTitle: task.title,
        taskDescription: task.description ?? "",
        projectId: project.id,
        repoDir,
        worktreeDir,
        signalResponses,
        imageUrls,
        comments,
      }, { convex })
    } catch (promptError) {
      const message = promptError instanceof Error ? promptError.message : String(promptError)
      console.error(`[WorkPhase] Failed to build prompt for role ${role}: ${message}`)
      await log({
        projectId: project.id,
        cycle,
        phase: "work",
        action: "prompt_build_failed",
        taskId: task.id,
        details: { error: message, role },
      })

      // Move task back to ready since we can't build a prompt
      try {
        await convex.mutation(api.tasks.move, {
          id: task.id,
          status: "ready",
        })
      } catch (moveError) {
        console.error(`[WorkPhase] Failed to revert task status:`, moveError)
      }

      // Continue to next task
      continue
    }

    // --- 5. Spawn agent via gateway RPC ---
    const model = getModelForRole(role)
    console.log(`[WorkPhase] Task ${task.id.slice(0, 8)} role=${role} → model=${model}`)

    try {
      const handle = await agents.spawn({
        taskId: task.id,
        projectId: project.id,
        role,
        message: prompt,
        model,
        thinking: "off",
        timeoutSeconds: 600,
      })

      await log({
        projectId: project.id,
        cycle,
        phase: "work",
        action: "agent_spawned",
        taskId: task.id,
        sessionKey: handle.sessionKey,
        details: { role, model: model ?? "default", sessionKey: handle.sessionKey },
      })

      // Update task with session key and initial agent info
      try {
        await convex.mutation(api.tasks.update, {
          id: task.id,
          session_id: handle.sessionKey,
          agent_session_key: handle.sessionKey,
        })
        // Note: Agent activity is now tracked in sessions table
        // Log agent assignment event
        await convex.mutation(api.task_events.logAgentAssigned, {
          taskId: task.id,
          sessionKey: handle.sessionKey,
          model,
          role,
        })
        // Log status change event (ready -> in_progress)
        await convex.mutation(api.task_events.logStatusChange, {
          taskId: task.id,
          from: 'ready',
          to: 'in_progress',
          actor: 'work-loop',
          reason: 'task_claimed',
        })
      } catch (updateError) {
        console.error(`[WorkPhase] Failed to update task agent info:`, updateError)
      }

      // --- 6. Return success (only one task per cycle) ---
      return { claimed: true, taskId: task.id, role }
    } catch (spawnError) {
      const message = spawnError instanceof Error ? spawnError.message : String(spawnError)
      await log({
        projectId: project.id,
        cycle,
        phase: "work",
        action: "spawn_failed",
        taskId: task.id,
        details: { error: message },
      })

      // Try to move task back to ready since spawn failed
      try {
        await convex.mutation(api.tasks.move, {
          id: task.id,
          status: "ready",
        })
      } catch (moveError) {
        console.error(`[WorkPhase] Failed to revert task status:`, moveError)
      }

      return { claimed: false }
    }
  }

  // No claimable tasks found
  await log({
    projectId: project.id,
    cycle,
    phase: "work",
    action: "no_claimable_tasks",
    details: { readyCount: sortedTasks.length },
  })

  return { claimed: false }
}
