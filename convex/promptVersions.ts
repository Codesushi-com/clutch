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

// ============================================
// Mutations
// ============================================

/**
 * Create a new prompt version.
 * Auto-increments version number for the role+model combo.
 */
export const create = mutation({
  args: {
    role: v.string(),
    content: v.string(),
    model: v.optional(v.string()),
    change_summary: v.optional(v.string()),
    parent_version_id: v.optional(v.string()),
    created_by: v.string(),
  },
  handler: async (ctx, args): Promise<PromptVersion> => {
    const { role, content, model, change_summary, parent_version_id, created_by } = args

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
 */
export const update = mutation({
  args: {
    id: v.string(),
    content: v.optional(v.string()),
    change_summary: v.optional(v.string()),
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
