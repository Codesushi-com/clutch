import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { generateId } from './_helpers'

// ============================================
// Types
// ============================================

export type PromptVersion = {
  id: string
  role: string
  model: string | null
  version: number
  content: string
  change_summary: string | null
  parent_version_id: string | null
  created_by: string
  active: boolean
  created_at: number
}

// ============================================
// Queries
// ============================================

/**
 * Get the active prompt version for a role + model combo
 * If model is not specified, returns the default (model=null) active version
 */
export const getActive = query({
  args: {
    role: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PromptVersion | null> => {
    // First try to find a version for the specific model
    if (args.model) {
      const specificVersion = await ctx.db
        .query('promptVersions')
        .withIndex('by_role_model', (q) =>
          q.eq('role', args.role).eq('model', args.model)
        )
        .filter((q) => q.eq(q.field('active'), true))
        .unique()

      if (specificVersion) {
        return toPromptVersion(specificVersion)
      }
    }

    // Fall back to default (model=null) version
    const defaultVersion = await ctx.db
      .query('promptVersions')
      .withIndex('by_role_model', (q) =>
        q.eq('role', args.role).eq('model', undefined)
      )
      .filter((q) => q.eq(q.field('active'), true))
      .unique()

    if (defaultVersion) {
      return toPromptVersion(defaultVersion)
    }

    return null
  },
})

/**
 * Get a specific version by its UUID
 */
export const getByVersion = query({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args): Promise<PromptVersion | null> => {
    const version = await ctx.db
      .query('promptVersions')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!version) {
      return null
    }

    return toPromptVersion(version)
  },
})

/**
 * List all versions for a role, ordered by version number descending
 */
export const listByRole = query({
  args: {
    role: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PromptVersion[]> => {
    let versions

    if (args.model) {
      versions = await ctx.db
        .query('promptVersions')
        .withIndex('by_role_model', (q) =>
          q.eq('role', args.role).eq('model', args.model)
        )
        .collect()
    } else {
      versions = await ctx.db
        .query('promptVersions')
        .withIndex('by_role', (q) => q.eq('role', args.role))
        .collect()
    }

    return versions
      .sort((a, b) => b.version - a.version)
      .map((v) => toPromptVersion(v))
  },
})

/**
 * Get all distinct roles that have prompt templates
 */
export const listRoles = query({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const allVersions = await ctx.db.query('promptVersions').collect()
    const roles = new Set<string>()

    for (const version of allVersions) {
      roles.add(version.role)
    }

    return Array.from(roles).sort()
  },
})

/**
 * Check if a role already has any versions (for idempotent seeding)
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

// ============================================
// Mutations
// ============================================

/**
 * Create a new prompt version
 * Automatically deactivates the previous active version for this role+model combo
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
    const now = Date.now()

    // Find the current active version to deactivate it and get next version number
    const existingVersions = await ctx.db
      .query('promptVersions')
      .withIndex('by_role_model', (q) =>
        q.eq('role', args.role).eq('model', args.model)
      )
      .collect()

    const maxVersion = existingVersions.length > 0
      ? Math.max(...existingVersions.map((v) => v.version))
      : 0

    // Deactivate all existing active versions for this role+model
    for (const existing of existingVersions) {
      if (existing.active) {
        await ctx.db.patch(existing._id, { active: false })
      }
    }

    // Create new version
    const id = generateId()
    const newVersion = maxVersion + 1

    const internalId = await ctx.db.insert('promptVersions', {
      id,
      role: args.role,
      model: args.model,
      version: newVersion,
      content: args.content,
      change_summary: args.change_summary,
      parent_version_id: args.parent_version_id,
      created_by: args.created_by,
      active: true,
      created_at: now,
    })

    const created = await ctx.db.get(internalId)
    if (!created) {
      throw new Error('Failed to create prompt version')
    }

    return toPromptVersion(created)
  },
})

// ============================================
// Helper Functions
// ============================================

/**
 * Convert Convex document to PromptVersion type
 */
function toPromptVersion(doc: {
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
}): PromptVersion {
  return {
    id: doc.id,
    role: doc.role,
    model: doc.model ?? null,
    version: doc.version,
    content: doc.content,
    change_summary: doc.change_summary ?? null,
    parent_version_id: doc.parent_version_id ?? null,
    created_by: doc.created_by,
    active: doc.active,
    created_at: doc.created_at,
  }
}
