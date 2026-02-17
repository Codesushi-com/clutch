/**
 * Prompt Builder
 *
 * Builds role-specific prompts for sub-agents working on tasks.
 * Fetches the SOUL template from Convex promptVersions (single source of truth)
 * and injects task-specific context using Handlebars template rendering.
 */

import type { ConvexHttpClient } from "convex/browser"
import { fetchActivePrompt, PromptNotFoundError } from "./prompt-fetcher"
import { renderTemplate, validateTemplate, type ValidationResult } from "./template-engine"

// ============================================
// Types
// ============================================

export interface TaskComment {
  author: string
  content: string
  timestamp: string
}

export interface PromptParams {
  /** The role of the agent (dev, pm, research, reviewer, conflict_resolver, verify) */
  role: string
  /** The task ID */
  taskId: string
  /** The task title */
  taskTitle: string
  /** The task description */
  taskDescription: string
  /** The project ID */
  projectId: string
  /** The project slug (for CLI commands) */
  projectSlug?: string
  /** The repository directory */
  repoDir: string
  /** The worktree directory for dev tasks */
  worktreeDir: string
  /** Signal Q&A history (for PM tasks with user responses) */
  signalResponses?: Array<{ question: string; response: string }>
  /** Optional image URLs for the PM to analyze */
  imageUrls?: string[]
  /** Optional PR number (for reviewer, conflict_resolver, and verify roles) */
  prNumber?: number | null
  /** Optional branch name (for conflict_resolver and verify roles) */
  branch?: string | null
  /** Optional task comments for context (from previous work / triage) */
  comments?: TaskComment[]
  /** Optional post-merge steps (for verify role) */
  postMergeSteps?: string
}

export interface BuildPromptOptions {
  /** Convex client for fetching prompts from DB */
  convex: ConvexHttpClient
  /** Optional fallback behavior if Convex prompt not found */
  allowFallback?: boolean
  /** Optional logger for errors */
  logError?: (message: string) => void
}

// ============================================
// Variable Builders
// ============================================

/**
 * Build template variables for a PM role task
 */
function buildPmTemplateVariables(params: PromptParams): Record<string, unknown> {
  return {
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    taskDescription: params.taskDescription,
    projectSlug: params.projectSlug ?? "clutch",
    repoDir: params.repoDir,
    comments: params.comments ?? [],
    imageUrls: params.imageUrls ?? [],
    signalResponses: params.signalResponses ?? [],
    hasSignalResponses: (params.signalResponses?.length ?? 0) > 0,
    hasComments: (params.comments?.length ?? 0) > 0,
    hasImages: (params.imageUrls?.length ?? 0) > 0,
  }
}

/**
 * Build template variables for a Research role task
 */
function buildResearchTemplateVariables(params: PromptParams): Record<string, unknown> {
  return {
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    taskDescription: params.taskDescription,
    projectSlug: params.projectSlug ?? "clutch",
    repoDir: params.repoDir,
    comments: params.comments ?? [],
    hasComments: (params.comments?.length ?? 0) > 0,
  }
}

/**
 * Build template variables for a Reviewer role task
 */
function buildReviewerTemplateVariables(params: PromptParams): Record<string, unknown> {
  const branchName = params.branch ?? `fix/${params.taskId.slice(0, 8)}`
  return {
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    taskDescription: params.taskDescription,
    projectSlug: params.projectSlug ?? "clutch",
    repoDir: params.repoDir,
    comments: params.comments ?? [],
    prNumber: params.prNumber,
    branchName,
    worktreeDir: params.worktreeDir,
    hasPrNumber: params.prNumber != null,
    hasComments: (params.comments?.length ?? 0) > 0,
  }
}

/**
 * Build template variables for a ConflictResolver role task
 */
function buildConflictResolverTemplateVariables(params: PromptParams): Record<string, unknown> {
  const branchName = params.branch ?? `fix/${params.taskId.slice(0, 8)}`
  return {
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    taskDescription: params.taskDescription,
    projectSlug: params.projectSlug ?? "clutch",
    repoDir: params.repoDir,
    comments: params.comments ?? [],
    prNumber: params.prNumber,
    branchName,
    worktreeDir: params.worktreeDir,
    hasPrNumber: params.prNumber != null,
    hasComments: (params.comments?.length ?? 0) > 0,
  }
}

/**
 * Build template variables for a Dev role task
 */
function buildDevTemplateVariables(params: PromptParams): Record<string, unknown> {
  const branchName = `fix/${params.taskId.slice(0, 8)}`
  return {
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    taskDescription: params.taskDescription,
    projectSlug: params.projectSlug ?? "clutch",
    repoDir: params.repoDir,
    comments: params.comments ?? [],
    branchName,
    worktreeDir: params.worktreeDir,
    hasComments: (params.comments?.length ?? 0) > 0,
  }
}

/**
 * Build template variables for a Verify role task
 */
function buildVerifyTemplateVariables(params: PromptParams): Record<string, unknown> {
  const branchName = params.branch ?? `fix/${params.taskId.slice(0, 8)}`
  return {
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    taskDescription: params.taskDescription,
    projectSlug: params.projectSlug ?? "clutch",
    repoDir: params.repoDir,
    comments: params.comments ?? [],
    prNumber: params.prNumber,
    branchName,
    worktreeDir: params.worktreeDir,
    postMergeSteps: params.postMergeSteps,
    hasPostMergeSteps: params.postMergeSteps != null && params.postMergeSteps.length > 0,
    hasComments: (params.comments?.length ?? 0) > 0,
  }
}

/**
 * Build template variables based on role
 */
function buildTemplateVariables(params: PromptParams): Record<string, unknown> {
  switch (params.role) {
    case "pm":
      return buildPmTemplateVariables(params)
    case "research":
    case "researcher": // Backwards compatibility
      return buildResearchTemplateVariables(params)
    case "reviewer":
      return buildReviewerTemplateVariables(params)
    case "conflict_resolver":
      return buildConflictResolverTemplateVariables(params)
    case "verify":
      return buildVerifyTemplateVariables(params)
    case "dev":
    default:
      return buildDevTemplateVariables(params)
  }
}

// ============================================
// Main Prompt Builder
// ============================================

/**
 * Build a complete prompt by fetching the role SOUL template from Convex
 * and injecting task-specific context.
 *
 * This is the primary way to build prompts for sub-agents. It ensures:
 * - The SOUL template comes from Convex promptVersions (single source of truth)
 * - Task-specific instructions are injected as context
 * - Errors loudly if no active prompt version exists for the role
 *
 * Templates can use Handlebars syntax for variable substitution:
 * - {{variable}} for simple substitution
 * - {{#if condition}}...{{/if}} for conditionals
 * - {{#each items}}...{{/each}} for loops
 *
 * Templates are compiled once and cached for performance. The cache key is derived
 * from template content, so identical templates reuse the compiled function.
 *
 * @param params - Task and role parameters
 * @param options - Convex client and options
 * @returns The complete prompt string
 * @throws PromptNotFoundError if no active prompt exists for the role (and allowFallback is false)
 */
export async function buildPromptAsync(
  params: PromptParams,
  options: BuildPromptOptions
): Promise<string> {
  const { convex, allowFallback = false, logError } = options

  // Fetch the SOUL template from Convex (single source of truth)
  let soulTemplate: string
  try {
    const promptVersion = await fetchActivePrompt(convex, params.role)
    soulTemplate = promptVersion.content
  } catch (error) {
    if (error instanceof PromptNotFoundError) {
      const message = `No active prompt version found for role: ${params.role}. Run POST /api/prompts/seed to initialize prompts.`
      logError?.(`[PromptBuilder] ${message}`)

      if (!allowFallback) {
        throw new Error(message)
      }

      // Fallback: use a minimal default SOUL template
      logError?.(`[PromptBuilder] Using fallback SOUL template for role: ${params.role}`)
      soulTemplate = `# ${params.role.charAt(0).toUpperCase() + params.role.slice(1)}\n\nYou are a ${params.role} agent. Follow the task instructions below.`
    } else {
      throw error
    }
  }

  // Build template variables for the role
  const variables = buildTemplateVariables(params)

  // Render the SOUL template with variables (uses template cache internally)
  try {
    return renderTemplate(soulTemplate, variables)
  } catch (error) {
    logError?.(`[PromptBuilder] Template rendering failed: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

/**
 * Validate a prompt template for syntax errors and undefined variables
 *
 * @param template - The template string to validate
 * @param role - The role to validate against
 * @returns Validation result
 */
export function validatePromptTemplate(template: string, role: string): ValidationResult {
  return validateTemplate(template, role)
}

// ============================================
// Re-exports
// ============================================

export { PromptNotFoundError } from "./prompt-fetcher"

export {
  renderTemplate,
  renderTemplateSafe,
  validateTemplate,
  getVariableNamesForRole,
  generateVariableSchema,
  registerPromptHelpers,
  clearTemplateCache,
  getTemplateCacheStats,
  ROLE_VARIABLE_SCHEMAS,
  COMMON_VARIABLES,
  DEV_VARIABLES,
  REVIEWER_VARIABLES,
  PM_VARIABLES,
  RESEARCH_VARIABLES,
  CONFLICT_RESOLVER_VARIABLES,
} from "./template-engine"

export type {
  CommonTemplateVariables,
  DevTemplateVariables,
  ReviewerTemplateVariables,
  PmTemplateVariables,
  AllTemplateVariables,
  VariableSchema,
  ValidationResult,
} from "./template-engine"
