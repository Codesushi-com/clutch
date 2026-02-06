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

  constructor() {
    this.gateway = getGatewayClient()
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
        success: true,
        reply: "accepted",
        durationMs: 0,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const outcome: AgentOutcome = {
        taskId: params.taskId,
        sessionKey,
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
   * Reap finished and stale agents by checking gateway session list.
   *
   * Two reap conditions:
   * 1. **Finished**: Session key is no longer in the active sessions list.
   *    The agent completed (or errored) and the session aged out.
   * 2. **Stale**: Session is still "active" but `updatedAt` is older than
   *    `staleMs`. The agent is stuck — kill the session and reap the handle.
   *
   * Uses a wide session window (120 min) so we can capture usage from
   * recently-finished sessions that are still in the list but no longer
   * truly active (updatedAt stopped advancing).
   *
   * @param staleMs - Milliseconds of inactivity before a session is considered stuck.
   *                  Default: 15 minutes (900_000 ms).
   */
  async reapFinished(staleMs = 5 * 60 * 1000): Promise<AgentOutcome[]> {
    if (this.agents.size === 0) return []

    const reaped: AgentOutcome[] = []
    const now = Date.now()

    try {
      await this.gateway.connect()

      // Use a wide window (120 min) so recently-finished sessions still
      // appear — we need them for usage data even if they stopped updating.
      const sessions = await this.gateway.listSessions(120)
      const sessionsByKey = new Map(sessions.map((s) => [s.key, s]))

      for (const [taskId, handle] of this.agents) {
        const session = sessionsByKey.get(handle.sessionKey)
        let reason: "finished" | "stale" | null = null

        if (!session) {
          // Session completely gone from the list — it finished and aged out
          reason = "finished"
        } else {
          // Session exists — check if it's stale
          const lastActive = session.updatedAt ?? handle.spawnedAt
          const idleMs = now - lastActive
          const hasProducedOutput = (session.totalTokens ?? 0) > 0

          // Don't reap agents that haven't produced any output yet —
          // they may still be in their first turn (reading codebase, thinking).
          // Use a much longer grace period for agents still on their first turn.
          const effectiveStaleMs = hasProducedOutput ? staleMs : staleMs * 6

          if (idleMs >= effectiveStaleMs) {
            reason = "stale"

            // Kill the stuck session on the gateway
            try {
              await this.gateway.deleteSession(handle.sessionKey)
              console.log(
                `[AgentManager] Killed stale session ${handle.sessionKey} ` +
                `(idle ${Math.round(idleMs / 1000)}s, threshold ${Math.round(staleMs / 1000)}s)`,
              )
            } catch (killError) {
              const msg = killError instanceof Error ? killError.message : String(killError)
              console.warn(`[AgentManager] Failed to kill stale session ${handle.sessionKey}: ${msg}`)
              // Still reap the handle — the session may be in a broken state
            }
          }
        }

        if (reason) {
          const outcome: AgentOutcome = {
            taskId,
            sessionKey: handle.sessionKey,
            success: reason === "finished",
            reply: reason === "finished" ? "completed" : "stale_timeout",
            error: reason === "stale" ? `Agent stale for >${Math.round(staleMs / 60_000)}min` : undefined,
            durationMs: now - handle.spawnedAt,
            usage: session
              ? {
                  inputTokens: session.inputTokens ?? 0,
                  outputTokens: session.outputTokens ?? 0,
                  totalTokens: session.totalTokens ?? 0,
                }
              : undefined,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[AgentManager] reapFinished failed: ${message}`)
    }

    return reaped
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
