import { spawn as nodeSpawn, type ChildProcess } from "node:child_process"

/**
 * A tracked child process running an OpenClaw session
 */
export interface TrackedChild {
  /** Process ID */
  pid: number
  /** The underlying ChildProcess instance */
  process: ChildProcess
  /** Associated task ID */
  taskId: string
  /** Project ID the task belongs to */
  projectId: string
  /** Generated session key for the OpenClaw session */
  sessionKey: string
  /** Role of the agent (dev, pm, qa, etc.) */
  role: string
  /** Timestamp when the process was spawned (ms since epoch) */
  spawnedAt: number
  /** Timestamp of last stdout/stderr activity (ms since epoch) */
  lastOutput: number
  /** Exit code when the process exits, null while running */
  exitCode: number | null
  /** Total bytes received on stdout */
  totalBytes: number
}

/**
 * Parameters for spawning a new child process
 */
export interface SpawnParams {
  /** Task ID to associate with the process */
  taskId: string
  /** Project ID the task belongs to */
  projectId: string
  /** Role of the agent */
  role: string
  /** The message/prompt to send to the OpenClaw session */
  message: string
  /** Optional model override */
  model?: string
  /** Optional label for the session */
  label?: string
}

/**
 * Information about a completed child process
 */
export interface ReapedChild {
  /** Task ID */
  taskId: string
  /** Exit code from the process */
  exitCode: number
  /** Duration in milliseconds from spawn to exit */
  durationMs: number
}

/**
 * Manages a collection of child OpenClaw processes.
 *
 * Tracks lifecycle, output activity, and provides methods for
 * monitoring, reaping completed processes, and graceful shutdown.
 */
export class ChildManager {
  private children = new Map<string, TrackedChild>()

  /**
   * Spawn a new openclaw session for a task.
   *
   * Creates a child process running `openclaw chat` with the given message
   * and optional parameters. The process is tracked for lifecycle monitoring.
   *
   * @param params - Spawn parameters including taskId, projectId, role, and message
   * @returns The tracked child process information
   * @throws Error if the process fails to spawn or has no PID
   */
  spawn(params: SpawnParams): TrackedChild {
    const args = ["chat", "--message", params.message]
    if (params.model) args.push("--model", params.model)
    if (params.label) args.push("--label", params.label)

    const child = nodeSpawn("openclaw", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    })

    if (child.pid === undefined) {
      throw new Error(`Failed to spawn openclaw process for task ${params.taskId}`)
    }

    const now = Date.now()
    const tracked: TrackedChild = {
      pid: child.pid,
      process: child,
      taskId: params.taskId,
      projectId: params.projectId,
      sessionKey: `workloop:${params.role}:${params.taskId.slice(0, 8)}`,
      role: params.role,
      spawnedAt: now,
      lastOutput: now,
      exitCode: null,
      totalBytes: 0,
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      tracked.lastOutput = Date.now()
      tracked.totalBytes += chunk.length
    })

    child.stderr?.on("data", () => {
      tracked.lastOutput = Date.now()
    })

    child.on("exit", (code: number | null) => {
      tracked.exitCode = code ?? 1
    })

    this.children.set(params.taskId, tracked)
    return tracked
  }

  /**
   * Get all active (non-exited) child processes.
   *
   * @returns Array of tracked children that have not yet exited
   */
  active(): TrackedChild[] {
    return Array.from(this.children.values()).filter((child) => child.exitCode === null)
  }

  /**
   * Get the count of active child processes.
   *
   * @param projectId - Optional project ID to filter by
   * @returns Number of active children, optionally filtered by project
   */
  activeCount(projectId?: string): number {
    const active = this.active()
    if (projectId === undefined) {
      return active.length
    }
    return active.filter((child) => child.projectId === projectId).length
  }

  /**
   * Check for completed children and remove them from tracking.
   *
   * @returns Array of reaped child information including exit codes and durations
   */
  reap(): ReapedChild[] {
    const reaped: ReapedChild[] = []
    const now = Date.now()

    for (const [taskId, child] of this.children) {
      if (child.exitCode !== null) {
        reaped.push({
          taskId,
          exitCode: child.exitCode,
          durationMs: now - child.spawnedAt,
        })
        this.children.delete(taskId)
      }
    }

    return reaped
  }

  /**
   * Kill a specific child process by task ID.
   *
   * Sends SIGTERM to the process. The process will remain in tracking
   * until it actually exits and is reaped.
   *
   * @param taskId - The task ID of the child to kill
   */
  kill(taskId: string): void {
    const child = this.children.get(taskId)
    if (child && child.exitCode === null) {
      child.process.kill("SIGTERM")
    }
  }

  /**
   * Kill all tracked child processes.
   *
   * Sends SIGTERM to all active processes. Processes remain in tracking
   * until they exit and are reaped.
   */
  killAll(): void {
    for (const child of this.children.values()) {
      if (child.exitCode === null) {
        child.process.kill("SIGTERM")
      }
    }
  }

  /**
   * Get stale children that have had no output for a threshold period.
   *
   * @param thresholdMs - Threshold in milliseconds of inactivity
   * @returns Array of tracked children with no output for the threshold period
   */
  stale(thresholdMs: number): TrackedChild[] {
    const now = Date.now()
    return Array.from(this.children.values()).filter(
      (child) => child.exitCode === null && now - child.lastOutput > thresholdMs
    )
  }

  /**
   * Get a specific child by task ID.
   *
   * @param taskId - The task ID to look up
   * @returns The tracked child, or undefined if not found
   */
  get(taskId: string): TrackedChild | undefined {
    return this.children.get(taskId)
  }

  /**
   * Get the total number of tracked children (including exited).
   *
   * @returns Total count of tracked processes
   */
  size(): number {
    return this.children.size
  }
}

/**
 * Default singleton instance for convenience.
 *
 * Use this for the global child manager, or create new ChildManager
 * instances for isolated testing.
 */
export const childManager = new ChildManager()
