import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { generateId } from './_helpers'
import type { Project } from '../lib/types'

// Helper to generate a unique slug from a name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

// Helper to ensure slug uniqueness by appending a number if needed
async function ensureUniqueSlug(
  ctx: { db: { query: (table: string) => { withIndex: (index: string, fn: (q: { eq: (field: string, value: string) => unknown }) => unknown) => { unique: () => Promise<unknown> } } } },
  baseSlug: string,
  excludeUuid?: string
): Promise<string> {
  let slug = baseSlug
  let counter = 1

  while (true) {
    const existing = await ctx.db
      .query('projects')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique()

    if (!existing || (excludeUuid && (existing as { id: string }).id === excludeUuid)) {
      return slug
    }

    slug = `${baseSlug}-${counter}`
    counter++

    if (counter > 1000) {
      throw new Error('Unable to generate unique slug')
    }
  }
}

// Convert Convex document to Project type
function toProject(doc: {
  id: string
  slug: string
  name: string
  description?: string
  color: string
  repo_url?: string
  context_path?: string
  local_path?: string
  github_repo?: string
  chat_layout: 'slack' | 'imessage'
  work_loop_enabled: boolean
  work_loop_max_agents?: number
  role_model_overrides?: Record<string, string>
  created_at: number
  updated_at: number
}): Project {
  return {
    id: doc.id,
    slug: doc.slug,
    name: doc.name,
    description: doc.description ?? null,
    color: doc.color,
    repo_url: doc.repo_url ?? null,
    context_path: doc.context_path ?? null,
    local_path: doc.local_path ?? null,
    github_repo: doc.github_repo ?? null,
    chat_layout: doc.chat_layout,
    work_loop_enabled: doc.work_loop_enabled ? 1 : 0,
    work_loop_max_agents: doc.work_loop_max_agents ?? null,
    role_model_overrides: doc.role_model_overrides ?? null,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  }
}

// ============================================
// Queries
// ============================================

/**
 * Get all projects with task counts
 */
export const getAll = query({
  args: {},
  handler: async (ctx): Promise<Array<Project & { task_count: number }>> => {
    const projects = await ctx.db.query('projects').collect()

    const projectsWithCounts = await Promise.all(
      projects.map(async (project) => {
        const tasks = await ctx.db
          .query('tasks')
          .withIndex('by_project', (q) => q.eq('project_id', project.id))
          .collect()

        return {
          ...toProject(project as Parameters<typeof toProject>[0]),
          task_count: tasks.length,
        }
      })
    )

    return projectsWithCounts.sort((a, b) => a.name.localeCompare(b.name))
  },
})

/**
 * Get all projects with per-status task counts and work loop state
 */
export const getAllWithStats = query({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query('projects').collect()

    const results = await Promise.all(
      projects.map(async (project) => {
        const tasks = await ctx.db
          .query('tasks')
          .withIndex('by_project', (q) => q.eq('project_id', project.id))
          .collect()

        const statusCounts = { backlog: 0, ready: 0, in_progress: 0, in_review: 0, done: 0, blocked: 0 }
        let lastActivity = project.updated_at
        for (const task of tasks) {
          statusCounts[task.status as keyof typeof statusCounts] += 1
          if (task.updated_at > lastActivity) {
            lastActivity = task.updated_at
          }
        }

        const loopState = await ctx.db
          .query('workLoopState')
          .withIndex('by_project', (q) => q.eq('project_id', project.id))
          .unique()

        // Count active agents from tasks (single source of truth)
        // Note: Active agent count now comes from sessions table
        const activeAgentCount = tasks.filter((task) => (task.status === 'in_progress' || task.status === 'in_review') && !!task.agent_session_key).length

        return {
          ...toProject(project as Parameters<typeof toProject>[0]),
          task_count: tasks.length,
          status_counts: statusCounts,
          active_agents: activeAgentCount,
          work_loop_status: loopState?.status ?? (project.work_loop_enabled ? 'stopped' : 'disabled') as string,
          last_activity: lastActivity,
        }
      })
    )

    return results.sort((a, b) => a.name.localeCompare(b.name))
  },
})

/**
 * Get a single project by UUID
 */
export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<Project | null> => {
    const project = await ctx.db
      .query('projects')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!project) {
      return null
    }

    return toProject(project as Parameters<typeof toProject>[0])
  },
})

/**
 * Get a project by slug
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args): Promise<Project | null> => {
    const project = await ctx.db
      .query('projects')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique()

    if (!project) {
      return null
    }

    return toProject(project as Parameters<typeof toProject>[0])
  },
})

// ============================================
// Mutations
// ============================================

/**
 * Create a new project
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    repo_url: v.optional(v.string()),
    context_path: v.optional(v.string()),
    local_path: v.optional(v.string()),
    github_repo: v.optional(v.string()),
    chat_layout: v.optional(v.union(v.literal('slack'), v.literal('imessage'))),
    work_loop_enabled: v.optional(v.boolean()),
    work_loop_max_agents: v.optional(v.number()),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Project> => {
    if (!args.name || args.name.trim().length === 0) {
      throw new Error('Project name is required')
    }

    if (args.name.length > 100) {
      throw new Error('Project name must be 100 characters or less')
    }

    const baseSlug = args.slug?.trim() || generateSlug(args.name)

    if (!baseSlug) {
      throw new Error('Unable to generate slug from project name')
    }

    if (baseSlug.length > 50) {
      throw new Error('Slug must be 50 characters or less')
    }

    const slug = await ensureUniqueSlug(ctx as unknown as Parameters<typeof ensureUniqueSlug>[0], baseSlug)

    const now = Date.now()
    const id = generateId()

    const internalId = await ctx.db.insert('projects', {
      id,
      slug,
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      color: args.color?.trim() || '#3b82f6',
      repo_url: args.repo_url?.trim() || undefined,
      context_path: args.context_path?.trim() || undefined,
      local_path: args.local_path?.trim() || undefined,
      github_repo: args.github_repo?.trim() || undefined,
      chat_layout: args.chat_layout || 'slack',
      work_loop_enabled: args.work_loop_enabled ?? false,
      work_loop_max_agents: args.work_loop_max_agents ?? undefined,
      created_at: now,
      updated_at: now,
    })

    const project = await ctx.db.get(internalId)

    if (!project) {
      throw new Error('Failed to create project')
    }

    return toProject(project as Parameters<typeof toProject>[0])
  },
})

/**
 * Update an existing project
 */
export const update = mutation({
  args: {
    id: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    repo_url: v.optional(v.string()),
    context_path: v.optional(v.string()),
    local_path: v.optional(v.string()),
    github_repo: v.optional(v.string()),
    chat_layout: v.optional(v.union(v.literal('slack'), v.literal('imessage'))),
    work_loop_enabled: v.optional(v.boolean()),
    work_loop_max_agents: v.optional(v.number()),
    role_model_overrides: v.optional(v.record(v.string(), v.string())),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Project> => {
    const existing = await ctx.db
      .query('projects')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!existing) {
      throw new Error(`Project not found: ${args.id}`)
    }

    if (args.name !== undefined) {
      if (args.name.trim().length === 0) {
        throw new Error('Project name cannot be empty')
      }
      if (args.name.length > 100) {
        throw new Error('Project name must be 100 characters or less')
      }
    }

    let newSlug = existing.slug
    if (args.slug !== undefined && args.slug !== existing.slug) {
      const baseSlug = args.slug.trim()

      if (!baseSlug) {
        throw new Error('Slug cannot be empty')
      }
      if (baseSlug.length > 50) {
        throw new Error('Slug must be 50 characters or less')
      }

      newSlug = await ensureUniqueSlug(ctx as unknown as Parameters<typeof ensureUniqueSlug>[0], baseSlug, args.id)
    }

    const now = Date.now()

    const updates: Record<string, unknown> = {
      updated_at: now,
    }

    if (args.name !== undefined) updates.name = args.name.trim()
    if (args.slug !== undefined) updates.slug = newSlug
    if (args.description !== undefined) updates.description = args.description?.trim() ?? undefined
    if (args.color !== undefined) updates.color = args.color.trim()
    if (args.repo_url !== undefined) updates.repo_url = args.repo_url?.trim() ?? undefined
    if (args.context_path !== undefined) updates.context_path = args.context_path?.trim() ?? undefined
    if (args.local_path !== undefined) updates.local_path = args.local_path?.trim() ?? undefined
    if (args.github_repo !== undefined) updates.github_repo = args.github_repo?.trim() ?? undefined
    if (args.chat_layout !== undefined) updates.chat_layout = args.chat_layout
    if (args.work_loop_enabled !== undefined) updates.work_loop_enabled = args.work_loop_enabled
    if (args.work_loop_max_agents !== undefined) updates.work_loop_max_agents = args.work_loop_max_agents
    if (args.role_model_overrides !== undefined) updates.role_model_overrides = args.role_model_overrides

    await ctx.db.patch(existing._id, updates)

    const updated = await ctx.db.get(existing._id)

    if (!updated) {
      throw new Error('Failed to update project')
    }

    return toProject(updated as Parameters<typeof toProject>[0])
  },
})

/**
 * Delete a project and all associated tasks (cascade delete)
 */
export const deleteProject = mutation({
  args: {
    id: v.string(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; deleted_task_count: number }> => {
    const project = await ctx.db
      .query('projects')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!project) {
      throw new Error(`Project not found: ${args.id}`)
    }

    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('project_id', args.id))
      .collect()

    if (tasks.length > 0 && !args.force) {
      throw new Error(
        `Cannot delete project: ${tasks.length} task(s) exist. ` +
          `Use force=true to delete anyway (tasks will be cascade deleted).`
      )
    }

    for (const task of tasks) {
      await ctx.db.delete(task._id)
    }

    await ctx.db.delete(project._id)

    return {
      success: true,
      deleted_task_count: tasks.length,
    }
  },
})

/**
 * Check if a slug is available
 */
export const isSlugAvailable = query({
  args: {
    slug: v.string(),
    excludeId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const existing = await ctx.db
      .query('projects')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique()

    if (!existing) {
      return true
    }

    if (args.excludeId && existing.id === args.excludeId) {
      return true
    }

    return false
  },
})

/**
 * Get project slug by project ID
 * Used by session watcher to resolve project slug from task's project_id
 */
export const getSlugById = query({
  args: { projectId: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const project = await ctx.db
      .query('projects')
      .withIndex('by_uuid', (q) => q.eq('id', args.projectId))
      .unique()

    if (!project) {
      return null
    }

    return project.slug
  },
})
