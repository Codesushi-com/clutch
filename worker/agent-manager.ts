/**
 * Agent Manager
 *
 * Manages agent sessions via the OpenClaw gateway WebSocket RPC.
 * Replaces the ChildManager (child_process.spawn) approach.
 *
 * Each agent is a long-running RPC call to the gateway. The gateway
 * creates a real session that is fully trackable (tokens, model, activity).
 */

import { getGatewayClient, type GatewayRpcClient } from "./gateway-client"
import { SessionFileReader } from "./session-file-reader"

// ============================================
// Types
// ============================================

export interface AgentHandle {
  taskId: string
  projectId: string
  role: string
  sessionKey: string
  model?: string
  spawnedAt: number
  /** The promise that resolves when the agent completes */
  promise: Promise<AgentOutcome>
}

export interface AgentOutcome {
  taskId: string
  sessionKey: string
  role: string
  success: boolean
  reply?: string
  error?: string
  durationMs: number
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

export interface SpawnAgentParams {
  taskId: string
  projectId: string
  role: string
  message: string
  model?: string
  thinking?: string
  timeoutSeconds?: number
}

// ============================================
// Agent Manager
// ============================================

export class AgentManager {
  private agents = new Map<string, AgentHandle>()
  private gateway: GatewayRpcClient
  private completedQueue: AgentOutcome[] = []
  private sessionFileReader: SessionFileReader
  /** Timestamp when this loop started. Used to ignore stale session files from previous runs. */
  private loopStartedAt: number

  constructor() {
    this.gateway = getGatewayClient()
    this.sessionFileReader = new SessionFileReader()
    this.loopStartedAt = Date.now()
  }

  /**
   * Spawn a new agent via the gateway.
   *
   * This sends an async RPC call that will run until the agent completes.
   * The agent is tracked internally and its session is visible in OpenClaw.
   */
  async spawn(params: SpawnAgentParams): Promise<AgentHandle> {
    // Ensure gateway connection
    await this.gateway.connect()

    const sessionKey = `agent:main:trap:${params.role}:${params.taskId.slice(0, 8)}`
    const now = Date.now()

    // Create the long-running RPC promise
    const promise = this._runAgent(params, sessionKey, now)

    const handle: AgentHandle = {
      taskId: params.taskId,
      projectId: params.projectId,
      role: params.role,
      sessionKey,
      model: params.model,
      spawnedAt: now,
      promise,
    }

    this.agents.set(params.taskId, handle)
    return handle
  }

  private async _runAgent(
    params: SpawnAgentParams,
    sessionKey: string,
    _spawnedAt: number,
  ): Promise<AgentOutcome> {
    try {
      // The gateway accepts the agent run and executes it asynchronously.
      // This call returns quickly with status: "accepted".
      // The actual session is trackable via sessions.list.
      await this.gateway.runAgent({
        message: params.message,
        sessionKey,
        model: params.model,
        thinking: params.thinking ?? "off",
        timeout: params.timeoutSeconds ?? 600,
      })

      // Agent was accepted — it's now running on the gateway.
      // We DON'T remove from active here. The cleanup phase will
      // detect when the session finishes via sessions polling.
      return {
        taskId: params.taskId,
        sessionKey,
        role: params.role,
        success: true,
        reply: "accepted",
        durationMs: 0,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const outcome: AgentOutcome = {
        taskId: params.taskId,
        sessionKey,
        role: params.role,
        success: false,
        error: message,
        durationMs: 0,
      }

      this.completedQueue.push(outcome)
      this.agents.delete(params.taskId)
      return outcome
    }
  }

  /**
   * Reap finished and stale agents by reading session JSONL files directly.
   *
   * Uses SessionFileReader to detect completion via stopReason and staleness
   * via file mtime, which is more reliable than the RPC sessions.list API.
   *
   * Three conditions:
   * 1. **Done**: Last assistant message has stopReason === "stop" → reap as finished
   * 2. **Stale**: File mtime is older than staleMs AND not done → reap as stale
   * 3. **Working**: File mtime is recent OR stopReason === "toolUse" → leave alone
   *
   * @param staleMs - Milliseconds of inactivity before a session is considered stuck.
   *                  Default: 5 minutes (300_000 ms).
   */
  async reapFinished(staleMs = 5 * 60 * 1000): Promise<{
    reaped: AgentOutcome[]
    activeUpdates: Array<{
      task_id: string
      agent_session_key: string
      agent_last_active_at: number
      agent_output_preview?: string
      agent_tokens_in?: number
      agent_tokens_out?: number
    }>
  }> {
    if (this.agents.size === 0) return { reaped: [], activeUpdates: [] }

    const reaped: AgentOutcome[] = []
    const activeUpdates: Array<{
      task_id: string
      agent_session_key: string
      agent_last_active_at: number
      agent_output_preview?: string
      agent_tokens_in?: number
      agent_tokens_out?: number
    }> = []
    const now = Date.now()

    for (const [taskId, handle] of this.agents) {
      const info = this.sessionFileReader.getSessionInfo(handle.sessionKey, staleMs)

      // Ignore stale session files from previous loop runs
      // This prevents false tombstones when the loop restarts
      if (info && info.fileMtimeMs < this.loopStartedAt) {
        continue
      }

      let reason: "finished" | "stale" | null = null
      let outcomeUsage: AgentOutcome["usage"] = undefined
      let replyText = ""

      if (!info) {
        // Session file not found yet — agent may still be starting up.
        // Only treat as finished if the agent has been running for a while.
        const agentAgeMs = now - handle.spawnedAt
        if (agentAgeMs < 60_000) {
          // Agent was spawned less than 60s ago — give it time to create its session file
          continue
        }
        // Session file still missing after 60s — treat as failed/gone
        reason = "finished"
        replyText = "completed"
      } else if (info.isDone) {
        // Session has stopReason === "stop" → completed successfully
        reason = "finished"
        replyText = info.lastAssistantMessage?.textPreview ?? "completed"
        outcomeUsage = info.lastAssistantMessage
          ? {
              inputTokens: info.lastAssistantMessage.usage.input,
              outputTokens: info.lastAssistantMessage.usage.output,
              totalTokens: info.lastAssistantMessage.usage.total,
            }
          : undefined
      } else if (info.isStale) {
        // File mtime is old and session is not done → stale
        reason = "stale"
        replyText = "stale_timeout"
        outcomeUsage = info.lastAssistantMessage
          ? {
              inputTokens: info.lastAssistantMessage.usage.input,
              outputTokens: info.lastAssistantMessage.usage.output,
              totalTokens: info.lastAssistantMessage.usage.total,
            }
          : undefined

        // Kill the stuck session on the gateway
        try {
          await this.gateway.deleteSession(handle.sessionKey)
          console.log(
            `[AgentManager] Killed stale session ${handle.sessionKey} ` +
            `(mtime ${Math.round((now - info.fileMtimeMs) / 1000)}s ago, threshold ${Math.round(staleMs / 1000)}s)`,
          )
        } catch (killError) {
          const msg = killError instanceof Error ? killError.message : String(killError)
          console.warn(`[AgentManager] Failed to kill stale session ${handle.sessionKey}: ${msg}`)
          // Still reap the handle — the session may be in a broken state
        }
      } else {
        // Session is still active (recent mtime or mid-tool-call)
        // Collect update for active agent to refresh last_active_at in Convex
        activeUpdates.push({
          task_id: taskId,
          agent_session_key: handle.sessionKey,
          agent_last_active_at: info.fileMtimeMs,
          agent_output_preview: info.lastAssistantMessage?.textPreview,
          agent_tokens_in: info.lastAssistantMessage?.usage.input,
          agent_tokens_out: info.lastAssistantMessage?.usage.output,
        })
        continue
      }

      if (reason) {
        const outcome: AgentOutcome = {
          taskId,
          sessionKey: handle.sessionKey,
          role: handle.role,
          success: reason === "finished",
          reply: replyText,
          error: reason === "stale" ? `Agent stale for >${Math.round(staleMs / 60_000)}min` : undefined,
          durationMs: now - handle.spawnedAt,
          usage: outcomeUsage,
        }
        reaped.push(outcome)
        this.completedQueue.push(outcome)
        this.agents.delete(taskId)
      }
    }

    if (reaped.length > 0) {
      console.log(
        `[AgentManager] Reaped ${reaped.length} agent(s): ` +
        reaped.map((r) => `${r.sessionKey} (${r.reply})`).join(", "),
      )
    }

    if (activeUpdates.length > 0) {
      console.log(
        `[AgentManager] Active updates for ${activeUpdates.length} agent(s): ` +
        activeUpdates.map((u) => `${u.agent_session_key}`).join(", "),
      )
    }

    return { reaped, activeUpdates }
  }

  /**
   * Get all active (running) agent handles.
   */
  active(): AgentHandle[] {
    return Array.from(this.agents.values())
  }

  /**
   * Count active agents, optionally filtered by project.
   */
  activeCount(projectId?: string): number {
    if (projectId === undefined) {
      return this.agents.size
    }
    let count = 0
    for (const agent of this.agents.values()) {
      if (agent.projectId === projectId) count++
    }
    return count
  }

  /**
   * Count active agents by role, optionally filtered by project.
   */
  activeCountByRole(role: string, projectId?: string): number {
    let count = 0
    for (const agent of this.agents.values()) {
      if (agent.role === role && (projectId === undefined || agent.projectId === projectId)) count++
    }
    return count
  }

  /**
   * Drain completed agents from the queue.
   * Returns outcomes since the last drain.
   */
  drainCompleted(): AgentOutcome[] {
    const completed = [...this.completedQueue]
    this.completedQueue = []
    return completed
  }

  /**
   * Check if a specific task has an active agent.
   */
  has(taskId: string): boolean {
    return this.agents.has(taskId)
  }

  /**
   * Get a specific agent handle by task ID.
   */
  get(taskId: string): AgentHandle | undefined {
    return this.agents.get(taskId)
  }

  /**
   * Get session keys for all active agents.
   */
  activeSessionKeys(): string[] {
    return Array.from(this.agents.values()).map((a) => a.sessionKey)
  }

  /**
   * Disconnect from the gateway and clean up.
   */
  shutdown(): void {
    this.gateway.disconnect()
  }
}

// ============================================
// Singleton
// ============================================

export const agentManager = new AgentManager()
