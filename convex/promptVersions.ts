import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { generateId } from './_helpers'

// ============================================
// Types
// ============================================

type PromptVersion = {
  id: string
  role: string
  model?: string
  version: number
  content: string
  change_summary?: string
  parent_version_id?: string
  created_by: string
  active: boolean
  created_at: number
  template_variables?: string // JSON string of VariableSchema[]
  ab_status?: 'control' | 'challenger' | 'none'
  ab_split_percent?: number
  ab_started_at?: number
  ab_min_tasks?: number
}

// Variable schema definition
interface VariableSchema {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required: boolean
  description: string
}

// ============================================
// Variable Schema Definitions (inline for Convex compatibility)
// ============================================

const COMMON_VARIABLES: VariableSchema[] = [
  { name: 'taskId', type: 'string', required: true, description: 'Unique task identifier' },
  { name: 'taskTitle', type: 'string', required: true, description: 'Task title' },
  { name: 'taskDescription', type: 'string', required: true, description: 'Task description' },
  { name: 'projectSlug', type: 'string', required: true, description: 'Project slug for CLI commands' },
  { name: 'repoDir', type: 'string', required: true, description: 'Repository directory path' },
  { name: 'comments', type: 'array', required: false, description: 'Task comments from previous work' },
]

const DEV_VARIABLES: VariableSchema[] = [
  ...COMMON_VARIABLES,
  { name: 'branchName', type: 'string', required: true, description: 'Git branch name' },
  { name: 'worktreeDir', type: 'string', required: true, description: 'Worktree directory path' },
]

const REVIEWER_VARIABLES: VariableSchema[] = [
  ...COMMON_VARIABLES,
  { name: 'prNumber', type: 'number', required: false, description: 'Pull request number' },
  { name: 'branchName', type: 'string', required: true, description: 'Git branch name' },
  { name: 'worktreeDir', type: 'string', required: true, description: 'Worktree directory path' },
]

const CONFLICT_RESOLVER_VARIABLES: VariableSchema[] = REVIEWER_VARIABLES

const PM_VARIABLES: VariableSchema[] = [
  ...COMMON_VARIABLES,
  { name: 'imageUrls', type: 'array', required: false, description: 'Attached image URLs' },
  { name: 'signalResponses', type: 'array', required: false, description: 'Signal Q&A responses' },
  { name: 'hasImages', type: 'boolean', required: false, description: 'Whether images are attached' },
  { name: 'hasSignalResponses', type: 'boolean', required: false, description: 'Whether signal Q&A exists' },
  { name: 'hasComments', type: 'boolean', required: false, description: 'Whether task comments exist' },
]

const RESEARCH_VARIABLES: VariableSchema[] = [
  ...COMMON_VARIABLES,
  { name: 'hasComments', type: 'boolean', required: false, description: 'Whether task comments exist' },
]

const VERIFY_VARIABLES: VariableSchema[] = [
  ...COMMON_VARIABLES,
  { name: 'prNumber', type: 'number', required: false, description: 'Pull request number' },
  { name: 'branch', type: 'string', required: false, description: 'Git branch name' },
  { name: 'postMergeSteps', type: 'string', required: false, description: 'Post-merge verification steps' },
  { name: 'timestamp', type: 'string', required: false, description: 'Comment timestamp' },
  { name: 'author', type: 'string', required: false, description: 'Comment author' },
  { name: 'content', type: 'string', required: false, description: 'Comment content' },
]

const ROLE_VARIABLE_SCHEMAS: Record<string, VariableSchema[]> = {
  dev: DEV_VARIABLES,
  reviewer: REVIEWER_VARIABLES,
  conflict_resolver: CONFLICT_RESOLVER_VARIABLES,
  pm: PM_VARIABLES,
  research: RESEARCH_VARIABLES,
  researcher: RESEARCH_VARIABLES, // Backwards compatibility
  verify: VERIFY_VARIABLES,
}

function getVariableNamesForRole(role: string): Set<string> {
  const schema = ROLE_VARIABLE_SCHEMAS[role] || COMMON_VARIABLES
  return new Set(schema.map((v) => v.name))
}

// ============================================
// Template Validation (lightweight for Convex)
// ============================================

interface ValidationResult {
  valid: boolean
  syntaxErrors: string[]
  undefinedVariables: string[]
}

/**
 * Extract variable references from a Handlebars template
 * Uses simple regex parsing since we can't import Handlebars in Convex
 */
function extractTemplateVariables(template: string): Set<string> {
  const variables = new Set<string>()
  const regex = /\{\{\{?[#/]?(\w+)(?:\.[\w.]+)?\}?\}?/g
  let match

  while ((match = regex.exec(template)) !== null) {
    const varName = match[1]
    // Skip Handlebars built-in helpers
    if (varName && !['if', 'unless', 'each', 'with', 'this'].includes(varName)) {
      variables.add(varName)
    }
  }

  return variables
}

/**
 * Validate Handlebars template syntax using regex
 * This is a lightweight check - full parsing happens in the worker
 */
function checkTemplateSyntax(template: string): string[] {
  const errors: string[] = []

  // Check for unclosed blocks
  const openBlockRegex = /\{\{#(\w+)/g
  const closeBlockRegex = /\{\{\/(\w+)/g

  const openBlocks: string[] = []
  let match

  while ((match = openBlockRegex.exec(template)) !== null) {
    if (!['else'].includes(match[1])) {
      openBlocks.push(match[1])
    }
  }

  while ((match = closeBlockRegex.exec(template)) !== null) {
    const index = openBlocks.lastIndexOf(match[1])
    if (index !== -1) {
      openBlocks.splice(index, 1)
    } else {
      errors.push(`Unexpected closing block: {{/${match[1]}}}`)
    }
  }

  if (openBlocks.length > 0) {
    errors.push(`Unclosed blocks: ${openBlocks.join(', ')}`)
  }

  // Check for malformed mustaches (unmatched braces)
  const openCount = (template.match(/\{\{/g) || []).length
  const closeCount = (template.match(/\}\}/g) || []).length

  if (openCount !== closeCount) {
    errors.push(`Mismatched braces: ${openCount} opening, ${closeCount} closing`)
  }

  return errors
}

/**
 * Validate a template for syntax errors and undefined variables
 */
export function validateTemplate(template: string, role: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    syntaxErrors: [],
    undefinedVariables: [],
  }

  // Check syntax
  const syntaxErrors = checkTemplateSyntax(template)
  if (syntaxErrors.length > 0) {
    result.valid = false
    result.syntaxErrors = syntaxErrors
  }

  // Only check variables if syntax is OK
  if (result.valid) {
    const referencedVars = extractTemplateVariables(template)
    const allowedVars = getVariableNamesForRole(role)

    for (const varName of referencedVars) {
      if (!allowedVars.has(varName)) {
        result.undefinedVariables.push(varName)
      }
    }

    if (result.undefinedVariables.length > 0) {
      result.valid = false
    }
  }

  return result
}

/**
 * Generate variable schema for a role as JSON string
 */
export function generateVariableSchema(role: string): string {
  const schema = ROLE_VARIABLE_SCHEMAS[role] || COMMON_VARIABLES
  return JSON.stringify(schema)
}

// ============================================
// Queries
// ============================================

/**
 * Get the latest (highest version) prompt for a role+model combo.
 * If model is not specified, returns the latest for any model (null model).
 */
export const getLatest = query({
  args: {
    role: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PromptVersion | null> => {
    const { role, model } = args

    // Query by role+model if model specified, otherwise get any for this role
    let versions
    if (model !== undefined) {
      versions = await ctx.db
        .query('promptVersions')
        .withIndex('by_role_model', (q) => q.eq('role', role).eq('model', model))
        .order('desc')
        .take(1)
    } else {
      versions = await ctx.db
        .query('promptVersions')
        .withIndex('by_role', (q) => q.eq('role', role))
        .order('desc')
        .take(1)
    }

    return (versions[0] as PromptVersion | undefined) ?? null
  },
})

/**
 * Get a specific version by role+model+version number.
 */
export const getByVersion = query({
  args: {
    role: v.string(),
    model: v.optional(v.string()),
    version: v.number(),
  },
  handler: async (ctx, args): Promise<PromptVersion | null> => {
    const { role, model, version } = args

    const versions = await ctx.db
      .query('promptVersions')
      .filter((q) =>
        q.and(
          q.eq(q.field('role'), role),
          model !== undefined ? q.eq(q.field('model'), model) : q.eq(q.field('model'), undefined),
          q.eq(q.field('version'), version)
        )
      )
      .take(1)

    return (versions[0] as PromptVersion | undefined) ?? null
  },
})

/**
 * Get a prompt version by its UUID (id field).
 */
export const getById = query({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args): Promise<PromptVersion | null> => {
    const versions = await ctx.db
      .query('promptVersions')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .take(1)
    return (versions[0] as PromptVersion | undefined) ?? null
  },
})

/**
 * List all versions for a role, ordered by version desc.
 * Optionally filter by model.
 */
export const listByRole = query({
  args: {
    role: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PromptVersion[]> => {
    const { role, model } = args

    let versions
    if (model !== undefined) {
      versions = await ctx.db
        .query('promptVersions')
        .withIndex('by_role_model', (q) => q.eq('role', role).eq('model', model))
        .order('desc')
        .collect()
    } else {
      versions = await ctx.db
        .query('promptVersions')
        .withIndex('by_role', (q) => q.eq('role', role))
        .order('desc')
        .collect()
    }

    return versions as PromptVersion[]
  },
})

/**
 * List all distinct roles that have prompt templates.
 */
export const listRoles = query({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const versions = await ctx.db.query('promptVersions').collect()
    const roles = new Set<string>()
    for (const v of versions) {
      roles.add(v.role)
    }
    return Array.from(roles).sort()
  },
})

/**
 * Check if a role already has any versions (for idempotency).
 */
export const hasVersionsForRole = query({
  args: {
    role: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const versions = await ctx.db
      .query('promptVersions')
      .withIndex('by_role', (q) => q.eq('role', args.role))
      .take(1)
    return versions.length > 0
  },
})

/**
 * Get the currently active version for a role.
 */
export const getActive = query({
  args: {
    role: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PromptVersion | null> => {
    const { role, model } = args

    let versions
    if (model !== undefined) {
      versions = await ctx.db
        .query('promptVersions')
        .withIndex('by_role_model', (q) => q.eq('role', role).eq('model', model))
        .filter((q) => q.eq(q.field('active'), true))
        .take(1)
    } else {
      versions = await ctx.db
        .query('promptVersions')
        .withIndex('by_role_active', (q) => q.eq('role', role).eq('active', true))
        .take(1)
    }

    return (versions[0] as PromptVersion | undefined) ?? null
  },
})

/**
 * Get variable schema for a role.
 */
export const getVariableSchema = query({
  args: {
    role: v.string(),
  },
  handler: async (_ctx, args): Promise<{ role: string; schema: VariableSchema[] }> => {
    const schema = ROLE_VARIABLE_SCHEMAS[args.role] || COMMON_VARIABLES
    return { role: args.role, schema }
  },
})

/**
 * Validate a template without saving it.
 */
export const validate = query({
  args: {
    role: v.string(),
    content: v.string(),
  },
  handler: async (_ctx, args): Promise<ValidationResult> => {
    return validateTemplate(args.content, args.role)
  },
})

// ============================================
// Mutations
// ============================================

/**
 * Create a new prompt version.
 * Auto-increments version number for the role+model combo.
 * Validates template syntax and variables.
 */
export const create = mutation({
  args: {
    role: v.string(),
    content: v.string(),
    model: v.optional(v.string()),
    change_summary: v.optional(v.string()),
    parent_version_id: v.optional(v.string()),
    created_by: v.string(),
    skip_validation: v.optional(v.boolean()), // Allow override for edge cases
  },
  handler: async (ctx, args): Promise<PromptVersion> => {
    const { role, content, model, change_summary, parent_version_id, created_by, skip_validation } = args

    // Validate template unless explicitly skipped
    if (!skip_validation) {
      const validation = validateTemplate(content, role)
      if (!validation.valid) {
        const errors = [
          ...validation.syntaxErrors.map((e) => `Syntax: ${e}`),
          ...validation.undefinedVariables.map((v) => `Undefined variable: ${v}`),
        ].join('; ')
        throw new Error(`Template validation failed: ${errors}`)
      }
    }

    // Get the latest version for this role+model to determine next version number
    let latestVersion = 0

    if (model !== undefined) {
      const existing = await ctx.db
        .query('promptVersions')
        .withIndex('by_role_model', (q) => q.eq('role', role).eq('model', model))
        .order('desc')
        .take(1)
      if (existing.length > 0) {
        latestVersion = existing[0].version
      }
    } else {
      const existing = await ctx.db
        .query('promptVersions')
        .withIndex('by_role', (q) => q.eq('role', role))
        .order('desc')
        .take(1)
      if (existing.length > 0) {
        latestVersion = existing[0].version
      }
    }

    const newVersion = latestVersion + 1

    // Deactivate previous active versions for this role+model
    if (model !== undefined) {
      const activeVersions = await ctx.db
        .query('promptVersions')
        .withIndex('by_role_model', (q) => q.eq('role', role).eq('model', model))
        .filter((q) => q.eq(q.field('active'), true))
        .collect()

      for (const v of activeVersions) {
        await ctx.db.patch(v._id, { active: false })
      }
    } else {
      const activeVersions = await ctx.db
        .query('promptVersions')
        .withIndex('by_role_active', (q) => q.eq('role', role).eq('active', true))
        .collect()

      for (const v of activeVersions) {
        await ctx.db.patch(v._id, { active: false })
      }
    }

    // Generate variable schema for this role
    const templateVariables = generateVariableSchema(role)

    // Create the new version as active
    const id = generateId()
    const now = Date.now()

    const promptVersion: Omit<PromptVersion, '_id' | '_creationTime'> = {
      id,
      role,
      model,
      version: newVersion,
      content,
      change_summary,
      parent_version_id,
      created_by,
      active: true,
      created_at: now,
      template_variables: templateVariables,
    }

    await ctx.db.insert('promptVersions', promptVersion)

    return {
      ...promptVersion,
      _id: undefined as unknown as string,
      _creationTime: undefined as unknown as number,
    } as PromptVersion
  },
})

/**
 * Set a specific version as active (deactivates others for that role+model).
 */
export const setActive = mutation({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    // Find the version by its UUID (id field)
    const versions = await ctx.db
      .query('promptVersions')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .take(1)

    if (versions.length === 0) {
      throw new Error(`Prompt version ${args.id} not found`)
    }

    const version = versions[0]
    const { role, model } = version

    // Deactivate all other versions for this role+model
    if (model !== undefined) {
      const activeVersions = await ctx.db
        .query('promptVersions')
        .withIndex('by_role_model', (q) => q.eq('role', role).eq('model', model))
        .filter((q) => q.eq(q.field('active'), true))
        .collect()

      for (const v of activeVersions) {
        if (v.id !== args.id) {
          await ctx.db.patch(v._id, { active: false })
        }
      }
    } else {
      const activeVersions = await ctx.db
        .query('promptVersions')
        .withIndex('by_role_active', (q) => q.eq('role', role).eq('active', true))
        .collect()

      for (const v of activeVersions) {
        if (v.id !== args.id) {
          await ctx.db.patch(v._id, { active: false })
        }
      }
    }

    // Activate the target version
    await ctx.db.patch(version._id, { active: true })
  },
})

/**
 * Update the content of a version (rarely used - prefer creating new versions).
 * Re-validates the template.
 */
export const update = mutation({
  args: {
    id: v.string(),
    content: v.optional(v.string()),
    change_summary: v.optional(v.string()),
    skip_validation: v.optional(v.boolean()), // Allow override for edge cases
  },
  handler: async (ctx, args): Promise<void> => {
    // Find the version by its UUID (id field)
    const versions = await ctx.db
      .query('promptVersions')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .take(1)

    if (versions.length === 0) {
      throw new Error(`Prompt version ${args.id} not found`)
    }

    const version = versions[0]

    // Validate template if content is being updated
    if (args.content !== undefined && !args.skip_validation) {
      const validation = validateTemplate(args.content, version.role)
      if (!validation.valid) {
        const errors = [
          ...validation.syntaxErrors.map((e) => `Syntax: ${e}`),
          ...validation.undefinedVariables.map((v) => `Undefined variable: ${v}`),
        ].join('; ')
        throw new Error(`Template validation failed: ${errors}`)
      }
    }

    const updates: Partial<Pick<PromptVersion, 'content' | 'change_summary'>> = {}
    if (args.content !== undefined) updates.content = args.content
    if (args.change_summary !== undefined) updates.change_summary = args.change_summary

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(versions[0]._id, updates)
    }
  },
})

/**
 * Delete a prompt version (use with caution).
 */
export const remove = mutation({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    // Find the version by its UUID (id field)
    const versions = await ctx.db
      .query('promptVersions')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .take(1)

    if (versions.length === 0) {
      throw new Error(`Prompt version ${args.id} not found`)
    }

    await ctx.db.delete(versions[0]._id)
  },
})

// ============================================
// A/B Testing
// ============================================

/**
 * Start an A/B test between the current active (control) and a challenger version.
 */
export const startABTest = mutation({
  args: {
    challenger_id: v.string(),
    split_percent: v.optional(v.number()),
    min_tasks: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ control_id: string; challenger_id: string }> => {
    const splitPercent = args.split_percent ?? 50
    const minTasks = args.min_tasks ?? 20

    if (splitPercent < 1 || splitPercent > 99) {
      throw new Error('split_percent must be between 1 and 99')
    }

    // Find the challenger
    const challengerDocs = await ctx.db
      .query('promptVersions')
      .withIndex('by_uuid', (q) => q.eq('id', args.challenger_id))
      .take(1)

    if (challengerDocs.length === 0) {
      throw new Error(`Challenger version ${args.challenger_id} not found`)
    }

    const challenger = challengerDocs[0]

    // Find the current active version for this role+model (will be the control)
    let activeVersions
    if (challenger.model !== undefined) {
      activeVersions = await ctx.db
        .query('promptVersions')
        .withIndex('by_role_model', (q) => q.eq('role', challenger.role).eq('model', challenger.model))
        .filter((q) => q.eq(q.field('active'), true))
        .collect()
    } else {
      activeVersions = await ctx.db
        .query('promptVersions')
        .withIndex('by_role_active', (q) => q.eq('role', challenger.role).eq('active', true))
        .collect()
    }

    if (activeVersions.length === 0) {
      throw new Error(`No active version found for role: ${challenger.role}`)
    }

    const control = activeVersions[0]

    if (control.id === challenger.id) {
      throw new Error('Challenger cannot be the same as the current active (control) version')
    }

    // Check for existing A/B test on this role+model
    const existingTests = await ctx.db
      .query('promptVersions')
      .withIndex('by_role_model', (q) =>
        q.eq('role', challenger.role).eq('model', challenger.model)
      )
      .filter((q) => q.eq(q.field('ab_status'), 'control'))
      .collect()

    if (existingTests.length > 0) {
      throw new Error(`A/B test already running for role: ${challenger.role}. End the current test first.`)
    }

    const now = Date.now()

    // Mark control
    await ctx.db.patch(control._id, {
      ab_status: 'control',
      ab_split_percent: splitPercent,
      ab_started_at: now,
      ab_min_tasks: minTasks,
    })

    // Mark challenger — also set active so both can be served
    await ctx.db.patch(challenger._id, {
      active: true,
      ab_status: 'challenger',
      ab_split_percent: splitPercent,
      ab_started_at: now,
      ab_min_tasks: minTasks,
    })

    return { control_id: control.id, challenger_id: challenger.id }
  },
})

/**
 * End an A/B test by promoting the challenger (it becomes the sole active version)
 * or rejecting it (control remains sole active).
 */
export const endABTest = mutation({
  args: {
    role: v.string(),
    model: v.optional(v.string()),
    action: v.union(v.literal('promote'), v.literal('reject')),
  },
  handler: async (ctx, args): Promise<void> => {
    const { role, model, action } = args

    // Find control and challenger
    const allVersions = await ctx.db
      .query('promptVersions')
      .withIndex('by_role_model', (q) => q.eq('role', role).eq('model', model))
      .collect()

    const control = allVersions.find((v) => v.ab_status === 'control')
    const challenger = allVersions.find((v) => v.ab_status === 'challenger')

    if (!control || !challenger) {
      throw new Error(`No active A/B test found for role: ${role}`)
    }

    if (action === 'promote') {
      // Challenger wins: deactivate control, keep challenger active
      await ctx.db.patch(control._id, {
        active: false,
        ab_status: 'none',
        ab_split_percent: undefined,
        ab_started_at: undefined,
        ab_min_tasks: undefined,
      })
      await ctx.db.patch(challenger._id, {
        active: true,
        ab_status: 'none',
        ab_split_percent: undefined,
        ab_started_at: undefined,
        ab_min_tasks: undefined,
      })
    } else {
      // Reject challenger: deactivate challenger, keep control active
      await ctx.db.patch(challenger._id, {
        active: false,
        ab_status: 'none',
        ab_split_percent: undefined,
        ab_started_at: undefined,
        ab_min_tasks: undefined,
      })
      await ctx.db.patch(control._id, {
        ab_status: 'none',
        ab_split_percent: undefined,
        ab_started_at: undefined,
        ab_min_tasks: undefined,
      })
    }
  },
})

/**
 * Get the A/B test state for a role+model combo.
 * Returns control, challenger, and their respective metrics from taskAnalyses.
 */
export const getABTestState = query({
  args: {
    role: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { role, model } = args

    const allVersions = await ctx.db
      .query('promptVersions')
      .withIndex('by_role_model', (q) => q.eq('role', role).eq('model', model))
      .collect()

    const control = allVersions.find((v) => v.ab_status === 'control')
    const challenger = allVersions.find((v) => v.ab_status === 'challenger')

    if (!control || !challenger) {
      return {
        active: false,
        role,
        model,
        control: null,
        challenger: null,
        split_percent: 50,
        min_tasks: 20,
        started_at: null,
        control_metrics: null,
        challenger_metrics: null,
      }
    }

    // Compute metrics for both from taskAnalyses
    const controlAnalyses = await ctx.db
      .query('taskAnalyses')
      .withIndex('by_prompt_version', (q) => q.eq('prompt_version_id', control.id))
      .collect()

    const challengerAnalyses = await ctx.db
      .query('taskAnalyses')
      .withIndex('by_prompt_version', (q) => q.eq('prompt_version_id', challenger.id))
      .collect()

    // Only count analyses that happened after A/B test started
    const startedAt = control.ab_started_at ?? 0
    const controlFiltered = controlAnalyses.filter((a) => a.analyzed_at >= startedAt)
    const challengerFiltered = challengerAnalyses.filter((a) => a.analyzed_at >= startedAt)

    const computeMetrics = (analyses: typeof controlFiltered, versionId: string, version: number) => {
      const total = analyses.length
      const successes = analyses.filter((a) => a.outcome === 'success').length
      const failures = analyses.filter((a) => a.outcome === 'failure').length
      const partials = analyses.filter((a) => a.outcome === 'partial').length
      const abandoned = analyses.filter((a) => a.outcome === 'abandoned').length

      const durations = analyses.filter((a) => a.duration_ms != null).map((a) => a.duration_ms!)
      const tokens = analyses.filter((a) => a.token_count != null).map((a) => a.token_count!)
      const confidences = analyses.map((a) => a.confidence)

      return {
        version_id: versionId,
        version,
        total_tasks: total,
        successes,
        failures,
        partials,
        abandoned,
        success_rate: total > 0 ? successes / total : 0,
        avg_confidence: confidences.length > 0
          ? confidences.reduce((s, c) => s + c, 0) / confidences.length
          : 0,
        avg_duration_ms: durations.length > 0
          ? durations.reduce((s, d) => s + d, 0) / durations.length
          : null,
        avg_tokens: tokens.length > 0
          ? tokens.reduce((s, t) => s + t, 0) / tokens.length
          : null,
      }
    }

    return {
      active: true,
      role,
      model,
      control: control as PromptVersion,
      challenger: challenger as PromptVersion,
      split_percent: control.ab_split_percent ?? 50,
      min_tasks: control.ab_min_tasks ?? 20,
      started_at: startedAt,
      control_metrics: computeMetrics(controlFiltered, control.id, control.version),
      challenger_metrics: computeMetrics(challengerFiltered, challenger.id, challenger.version),
    }
  },
})

/**
 * Resolve which prompt version to serve for a role+model, taking A/B test into account.
 * If an A/B test is running, randomly returns control or challenger based on split %.
 * Otherwise, returns the active version.
 */
export const resolveActive = query({
  args: {
    role: v.string(),
    model: v.optional(v.string()),
    /** Random seed 0-99 from the caller for deterministic split assignment */
    rand: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    promptVersion: PromptVersion | null
    ab_test: boolean
    ab_variant?: 'control' | 'challenger'
  }> => {
    const { role, model, rand } = args

    // Check if there's an active A/B test
    const allVersions = await ctx.db
      .query('promptVersions')
      .withIndex('by_role_model', (q) => q.eq('role', role).eq('model', model))
      .collect()

    const control = allVersions.find((v) => v.ab_status === 'control')
    const challenger = allVersions.find((v) => v.ab_status === 'challenger')

    if (control && challenger) {
      const splitPercent = control.ab_split_percent ?? 50
      // rand is 0-99; if < splitPercent, serve challenger
      const roll = rand ?? Math.floor(Math.random() * 100)
      const useChallenger = roll < splitPercent

      return {
        promptVersion: (useChallenger ? challenger : control) as PromptVersion,
        ab_test: true,
        ab_variant: useChallenger ? 'challenger' : 'control',
      }
    }

    // No A/B test — return normal active version
    let activeVersions
    if (model !== undefined) {
      activeVersions = await ctx.db
        .query('promptVersions')
        .withIndex('by_role_model', (q) => q.eq('role', role).eq('model', model))
        .filter((q) => q.eq(q.field('active'), true))
        .take(1)
    } else {
      activeVersions = await ctx.db
        .query('promptVersions')
        .withIndex('by_role_active', (q) => q.eq('role', role).eq('active', true))
        .take(1)
    }

    return {
      promptVersion: (activeVersions[0] as PromptVersion | undefined) ?? null,
      ab_test: false,
    }
  },
})
