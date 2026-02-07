/**
 * Analyze Phase
 *
 * Detects recently completed/failed tasks without analyses and spawns
 * post-mortem analyzer agents to review what happened.
 */

import type { ConvexHttpClient } from "convex/browser"
import { api } from "../../convex/_generated/api"
import type { AgentManager } from "../agent-manager"
import type { WorkLoopConfig } from "../config"
import type { LogRunParams } from "../logger"
import type { Task } from "../../lib/types"

interface AnalyzeContext {
  convex: ConvexHttpClient
  agents: AgentManager
  config: WorkLoopConfig
  cycle: number
  projectId: string
  log: (params: LogRunParams) => Promise<void>
}

interface AnalyzeResult {
  spawnedCount: number
  skippedCount: number
}

// ============================================
// Analyze Phase
// ============================================

/**
 * Run the analyze phase of the work loop.
 *
 * Finds tasks that need post-mortem analysis:
 * 1. Failed tasks (bounced back to ready/abandoned to backlog) - always analyzed
 * 2. Successful tasks (done) - ~25% sampled randomly
 *
 * For each qualifying task without an existing analysis, spawns an
 * analyzer sub-agent to review the session transcript and produce
 * a structured analysis.
 */
export async function runAnalyze(ctx: AnalyzeContext): Promise<AnalyzeResult> {
  const { convex, agents, config, cycle, projectId, log } = ctx

  let spawnedCount = 0
  let skippedCount = 0

  // Get unanalyzed tasks for this project
  const tasks = await getUnanalyzedTasks(convex, projectId)

  await log({
    projectId,
    cycle,
    phase: "analyze",
    action: "tasks_found",
    details: { count: tasks.length },
  })

  for (const task of tasks) {
    // Check capacity before each spawn
    const globalActive = agents.activeCount()
    if (globalActive >= config.maxAgentsGlobal) {
      await log({
        projectId,
        cycle,
        phase: "analyze",
        action: "limit_reached",
        details: { reason: "global_max_agents", limit: config.maxAgentsGlobal },
      })
      break
    }

    const projectActive = agents.activeCount(projectId)
    if (projectActive >= config.maxAgentsPerProject) {
      await log({
        projectId,
        cycle,
        phase: "analyze",
        action: "limit_reached",
        details: { reason: "project_max_agents", limit: config.maxAgentsPerProject },
      })
      break
    }

    const result = await processTask(ctx, task)

    if (result.spawned) {
      spawnedCount++
    } else {
      skippedCount++
    }

    await log({
      projectId,
      cycle,
      phase: "analyze",
      action: result.spawned ? "analyzer_spawned" : "analyzer_skipped",
      taskId: task.id,
      details: result.details,
    })
  }

  return { spawnedCount, skippedCount }
}

// ============================================
// Task Processing
// ============================================

interface TaskProcessResult {
  spawned: boolean
  details: Record<string, unknown>
}

async function processTask(ctx: AnalyzeContext, task: Task): Promise<TaskProcessResult> {
  const { agents, projectId } = ctx

  // Check if analyzer already running for this task
  if (agents.has(task.id)) {
    const existing = agents.get(task.id)
    return {
      spawned: false,
      details: {
        reason: "analyzer_already_running",
        taskId: task.id,
        sessionKey: existing?.sessionKey,
      },
    }
  }

  // Check if this task was recently reaped — don't re-spawn
  if (agents.isRecentlyReaped(task.id)) {
    return {
      spawned: false,
      details: {
        reason: "recently_reaped",
        taskId: task.id,
      },
    }
  }

  // Determine outcome based on status
  const outcome = determineOutcome(task)

  // Get task details including prompt_version_id
  const taskDetails = await ctx.convex.query(api.tasks.getById, { id: task.id })
  if (!taskDetails) {
    return {
      spawned: false,
      details: { reason: "task_not_found", taskId: task.id },
    }
  }

  // Use prompt_version_id if available, otherwise "legacy" for older tasks
  const promptVersionId = taskDetails.task.prompt_version_id ?? "legacy"

  // Build analyzer prompt
  const prompt = buildAnalyzerPrompt({
    taskId: task.id,
    taskTitle: task.title,
    taskDescription: task.description,
    outcome,
    sessionKey: task.session_id,
    promptVersionId,
    role: task.role ?? "dev",
  })

  // Spawn analyzer agent via gateway RPC
  try {
    const handle = await agents.spawn({
      taskId: task.id,
      projectId,
      role: "analyzer",
      message: prompt,
      model: "sonnet",
      timeoutSeconds: 600,
    })

    return {
      spawned: true,
      details: {
        taskId: task.id,
        outcome,
        sessionKey: handle.sessionKey,
        promptVersionId,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      spawned: false,
      details: {
        reason: "spawn_failed",
        taskId: task.id,
        error: message,
      },
    }
  }
}

// ============================================
// Helpers
// ============================================

/**
 * Determine the outcome category for a task based on its status
 */
function determineOutcome(task: Task): "success" | "failure" | "partial" | "abandoned" {
  if (task.status === "done") {
    return "success"
  }

  if (task.status === "backlog") {
    return "abandoned"
  }

  if (task.status === "ready") {
    // Check if it was previously in progress (would need comment history)
    // For now, assume bounced if in ready with session_id
    return task.session_id ? "failure" : "abandoned"
  }

  return "partial"
}

/**
 * Get unanalyzed tasks from Convex
 */
async function getUnanalyzedTasks(convex: ConvexHttpClient, projectId: string): Promise<Task[]> {
  try {
    const tasks = await convex.query(api.tasks.getUnanalyzed, {
      projectId,
      limit: 5, // Process max 5 per cycle to avoid overwhelming
    })
    return tasks
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[AnalyzePhase] Failed to fetch unanalyzed tasks: ${message}`)
    return []
  }
}

// ============================================
// Prompt Builder
// ============================================

interface AnalyzerPromptParams {
  taskId: string
  taskTitle: string
  taskDescription: string | null
  outcome: "success" | "failure" | "partial" | "abandoned"
  sessionKey: string | null
  promptVersionId: string
  role: string
}

function buildAnalyzerPrompt(params: AnalyzerPromptParams): string {
  return `# Post-Mortem Analyzer

## Identity
You are a Post-Mortem Analyzer responsible for reviewing completed or failed agent tasks and extracting insights to improve future performance.

## Responsibilities
- Review session transcripts to understand what happened
- Identify failure modes and root causes
- Suggest prompt amendments to prevent similar issues
- Produce structured analysis for the prompt evolution system

## Task Under Analysis

**Task ID:** ${params.taskId}
**Title:** ${params.taskTitle}
${params.taskDescription ? `**Description:** ${params.taskDescription}` : ""}
**Outcome:** ${params.outcome}
**Role:** ${params.role}
**Prompt Version ID:** ${params.promptVersionId}
${params.sessionKey ? `**Session Key:** ${params.sessionKey}` : ""}

## Your Task

1. **Fetch the session transcript** (if session key provided):
   Use the OpenClaw sessions API to get the full transcript:
   \`\`\`bash
   openclaw sessions history ${params.sessionKey} --json
   \`\`\`

2. **Fetch task comments**:
   \`\`\`bash
   curl -s http://localhost:3002/api/tasks/${params.taskId}/comments
   \`\`\`

3. **Analyze the work**:
   - What was the task asking for?
   - What approach did the agent take?
   - Where did things go wrong (if failure)?
   - What went well (if success)?
   - Were there missed requirements?
   - Were there coding standard violations?
   - Did the agent get stuck or need human intervention?

4. **Identify failure modes** (if applicable):
   - "misunderstood_requirements"
   - "hallucinated_api_usage"
   - "ignored_coding_standards"
   - "incomplete_implementation"
   - "failed_to_test"
   - "stuck_in_loop"
   - "premature_completion"
   - "other"

5. **Suggest prompt amendments**:
   - Specific changes to the ${params.role} role template
   - New rules or clarifications needed
   - Examples that should be added

## Output Format

Produce a structured analysis by calling the API:

\`\`\`bash
curl -X POST http://localhost:3002/api/task-analyses \\
  -H 'Content-Type: application/json' \\
  -d '{
    "task_id": "${params.taskId}",
    "session_key": "${params.sessionKey ?? ""}",
    "role": "${params.role}",
    "model": "sonnet",
    "prompt_version_id": "${params.promptVersionId}",
    "outcome": "${params.outcome}",
    "token_count": <estimated>,
    "duration_ms": <estimated>,
    "failure_modes": ["mode1", "mode2"],
    "amendments": ["Add rule about X", "Clarify Y in examples"],
    "analysis_summary": "Human-readable summary of what happened and why",
    "confidence": 0.85
  }'
\`\`\`

Then add a comment to the task with a brief summary:
\`\`\`bash
curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments \\
  -H 'Content-Type: application/json' \\
  -d '{
    "content": "Post-mortem analysis complete. Key finding: [one sentence summary].",
    "author": "analyzer",
    "author_type": "agent",
    "type": "completion"
  }'
\`\`\`

## Guidelines

- Be objective and specific in your analysis
- Focus on actionable improvements
- Don't blame the agent — identify systemic issues in prompts
- Confidence should reflect how certain you are of your assessment
- If you can't access the session transcript, note this in your analysis
`
}