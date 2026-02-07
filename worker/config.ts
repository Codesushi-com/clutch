/**
 * Work loop configuration
 *
 * Global defaults for the work loop system. Can be overridden via environment
 * variables. Per-project settings are stored in Convex on the project record.
 */

export interface WorkLoopConfig {
  /** Global on/off switch — default false (disabled) */
  enabled: boolean
  /** Sleep between cycles in milliseconds — default 30000 (30s) */
  cycleIntervalMs: number
  /** Max concurrent agents per project — default 2 */
  maxAgentsPerProject: number
  /** Max concurrent agents globally — default 5 */
  maxAgentsGlobal: number
  /** Max concurrent dev agents — default 2 */
  maxDevAgents: number
  /** Max concurrent reviewer agents — default 2 */
  maxReviewerAgents: number
  /** How long before in_progress is considered "stalled" — default 15 minutes */
  staleTaskMinutes: number
  /** How long before in_review without PR is stalled — default 30 minutes */
  staleReviewMinutes: number
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: WorkLoopConfig = {
  enabled: false,
  cycleIntervalMs: 30000,
  maxAgentsPerProject: 2,
  maxAgentsGlobal: 5,
  maxDevAgents: 2,
  maxReviewerAgents: 2,
  staleTaskMinutes: 15,
  staleReviewMinutes: 30,
}

/**
 * Parse a boolean from an environment variable
 */
function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') {
    return defaultValue
  }
  return value.toLowerCase() === 'true' || value === '1'
}

/**
 * Parse a number from an environment variable
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') {
    return defaultValue
  }
  const parsed = Number(value)
  if (isNaN(parsed) || parsed < 0) {
    return defaultValue
  }
  return parsed
}

/**
 * Load work loop configuration from environment variables
 *
 * Environment variables:
 * - WORK_LOOP_ENABLED — boolean (default: false)
 * - WORK_LOOP_CYCLE_MS — number in milliseconds (default: 30000)
 * - WORK_LOOP_MAX_AGENTS — max global agents (default: 5)
 * - WORK_LOOP_MAX_AGENTS_PER_PROJECT — max per project (default: 2)
 * - WORK_LOOP_STALE_TASK_MINUTES — minutes before in_progress is stalled (default: 60)
 * - WORK_LOOP_STALE_REVIEW_MINUTES — minutes before in_review is stalled (default: 30)
 */
export function loadConfig(): WorkLoopConfig {
  return {
    enabled: parseBool(process.env.WORK_LOOP_ENABLED, DEFAULT_CONFIG.enabled),
    cycleIntervalMs: parseNumber(process.env.WORK_LOOP_CYCLE_MS, DEFAULT_CONFIG.cycleIntervalMs),
    maxAgentsPerProject: parseNumber(process.env.WORK_LOOP_MAX_AGENTS_PER_PROJECT, DEFAULT_CONFIG.maxAgentsPerProject),
    maxAgentsGlobal: parseNumber(process.env.WORK_LOOP_MAX_AGENTS, DEFAULT_CONFIG.maxAgentsGlobal),
    maxDevAgents: parseNumber(process.env.WORK_LOOP_MAX_DEV_AGENTS, DEFAULT_CONFIG.maxDevAgents),
    maxReviewerAgents: parseNumber(process.env.WORK_LOOP_MAX_REVIEWER_AGENTS, DEFAULT_CONFIG.maxReviewerAgents),
    staleTaskMinutes: parseNumber(process.env.WORK_LOOP_STALE_TASK_MINUTES, DEFAULT_CONFIG.staleTaskMinutes),
    staleReviewMinutes: parseNumber(process.env.WORK_LOOP_STALE_REVIEW_MINUTES, DEFAULT_CONFIG.staleReviewMinutes),
  }
}

/**
 * Get the effective configuration for a project
 *
 * Merges global defaults with per-project overrides from Convex.
 */
export function getProjectConfig(
  globalConfig: WorkLoopConfig,
  projectOverrides: {
    work_loop_enabled?: boolean | null
    work_loop_max_agents?: number | null
  }
): WorkLoopConfig {
  return {
    ...globalConfig,
    enabled: projectOverrides.work_loop_enabled ?? globalConfig.enabled,
    maxAgentsPerProject: projectOverrides.work_loop_max_agents ?? globalConfig.maxAgentsPerProject,
  }
}
