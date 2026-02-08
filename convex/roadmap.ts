import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { generateId } from './_helpers'
import type { Feature, Requirement, RoadmapPhase, PhaseRequirement } from '../lib/types'

// ============================================
// Type Converters
// ============================================

function toFeature(doc: {
  id: string
  project_id: string
  title: string
  description?: string
  status: 'draft' | 'planned' | 'in_progress' | 'completed' | 'deferred'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  position: number
  created_at: number
  updated_at: number
}): Feature {
  return {
    id: doc.id,
    project_id: doc.project_id,
    title: doc.title,
    description: doc.description ?? null,
    status: doc.status,
    priority: doc.priority,
    position: doc.position,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  }
}

function toRequirement(doc: {
  id: string
  project_id: string
  feature_id?: string
  title: string
  description?: string
  category?: string
  status: 'draft' | 'approved' | 'implemented' | 'deferred'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  position: number
  created_at: number
  updated_at: number
}): Requirement {
  return {
    id: doc.id,
    project_id: doc.project_id,
    feature_id: doc.feature_id ?? null,
    title: doc.title,
    description: doc.description ?? null,
    category: doc.category ?? null,
    status: doc.status,
    priority: doc.priority,
    position: doc.position,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  }
}

function toRoadmapPhase(doc: {
  id: string
  project_id: string
  number: number
  name: string
  goal: string
  description?: string
  status: 'draft' | 'planned' | 'in_progress' | 'completed' | 'deferred'
  depends_on?: string
  success_criteria?: string
  position: number
  inserted?: boolean
  created_at: number
  updated_at: number
}): RoadmapPhase {
  return {
    id: doc.id,
    project_id: doc.project_id,
    number: doc.number,
    name: doc.name,
    goal: doc.goal,
    description: doc.description ?? null,
    status: doc.status,
    depends_on: doc.depends_on ? JSON.parse(doc.depends_on) : [],
    success_criteria: doc.success_criteria ? JSON.parse(doc.success_criteria) : [],
    position: doc.position,
    inserted: doc.inserted ?? false,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  }
}

function toPhaseRequirement(doc: {
  id: string
  phase_id: string
  requirement_id: string
  project_id: string
  created_at: number
}): PhaseRequirement {
  return {
    id: doc.id,
    phase_id: doc.phase_id,
    requirement_id: doc.requirement_id,
    project_id: doc.project_id,
    created_at: doc.created_at,
  }
}

// ============================================
// Feature Queries
// ============================================

/**
 * Get all features for a project
 */
export const getFeatures = query({
  args: {
    project_id: v.string(),
  },
  handler: async (ctx, args): Promise<Feature[]> => {
    const features = await ctx.db
      .query('features')
      .withIndex('by_project_position', (q) => q.eq('project_id', args.project_id))
      .collect()

    return features.map((f) => toFeature(f as Parameters<typeof toFeature>[0]))
  },
})

/**
 * Get a single feature by ID
 */
export const getFeature = query({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args): Promise<Feature | null> => {
    const feature = await ctx.db.query('features').withIndex('by_uuid', (q) => q.eq('id', args.id)).unique()
    if (!feature) return null
    return toFeature(feature as Parameters<typeof toFeature>[0])
  },
})

// ============================================
// Feature Mutations
// ============================================

/**
 * Create a new feature
 */
export const createFeature = mutation({
  args: {
    project_id: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal('draft'),
      v.literal('planned'),
      v.literal('in_progress'),
      v.literal('completed'),
      v.literal('deferred')
    )),
    priority: v.optional(v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('urgent')
    )),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Feature> => {
    const now = Date.now()

    // Get max position if not provided
    let position = args.position ?? 0
    if (args.position === undefined) {
      const existing = await ctx.db
        .query('features')
        .withIndex('by_project_position', (q) => q.eq('project_id', args.project_id))
        .collect()
      position = existing.length
    }

    const id = generateId()
    await ctx.db.insert('features', {
      id,
      project_id: args.project_id,
      title: args.title,
      description: args.description,
      status: args.status ?? 'draft',
      priority: args.priority ?? 'medium',
      position,
      created_at: now,
      updated_at: now,
    })

    const feature = await ctx.db.query('features').withIndex('by_uuid', (q) => q.eq('id', id)).unique()
    return toFeature(feature as Parameters<typeof toFeature>[0])
  },
})

/**
 * Update a feature
 */
export const updateFeature = mutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal('draft'),
      v.literal('planned'),
      v.literal('in_progress'),
      v.literal('completed'),
      v.literal('deferred')
    )),
    priority: v.optional(v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('urgent')
    )),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Feature> => {
    const { id, ...updates } = args
    const now = Date.now()

    const existing = await ctx.db.query('features').withIndex('by_uuid', (q) => q.eq('id', id)).unique()
    if (!existing) {
      throw new Error(`Feature not found: ${id}`)
    }

    await ctx.db.patch(existing._id, {
      ...updates,
      updated_at: now,
    })

    const feature = await ctx.db.query('features').withIndex('by_uuid', (q) => q.eq('id', id)).unique()
    return toFeature(feature as Parameters<typeof toFeature>[0])
  },
})

/**
 * Delete a feature
 */
export const deleteFeature = mutation({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const feature = await ctx.db.query('features').withIndex('by_uuid', (q) => q.eq('id', args.id)).unique()
    if (!feature) {
      throw new Error(`Feature not found: ${args.id}`)
    }

    // Delete associated requirements
    const requirements = await ctx.db
      .query('requirements')
      .withIndex('by_feature', (q) => q.eq('feature_id', args.id))
      .collect()

    for (const req of requirements) {
      await ctx.db.delete(req._id)
    }

    await ctx.db.delete(feature._id)
  },
})

/**
 * Reorder features within a project
 */
export const reorderFeatures = mutation({
  args: {
    project_id: v.string(),
    feature_ids: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now()

    for (let i = 0; i < args.feature_ids.length; i++) {
      const feature = await ctx.db
        .query('features')
        .withIndex('by_uuid', (q) => q.eq('id', args.feature_ids[i]))
        .unique()

      if (feature) {
        await ctx.db.patch(feature._id, {
          position: i,
          updated_at: now,
        })
      }
    }
  },
})

// ============================================
// Requirement Queries
// ============================================

/**
 * Get all requirements for a project
 */
export const getRequirements = query({
  args: {
    project_id: v.string(),
  },
  handler: async (ctx, args): Promise<Requirement[]> => {
    const requirements = await ctx.db
      .query('requirements')
      .withIndex('by_project', (q) => q.eq('project_id', args.project_id))
      .collect()

    return requirements.map((r) => toRequirement(r as Parameters<typeof toRequirement>[0]))
  },
})

/**
 * Get requirements for a specific feature
 */
export const getFeatureRequirements = query({
  args: {
    feature_id: v.string(),
  },
  handler: async (ctx, args): Promise<Requirement[]> => {
    const requirements = await ctx.db
      .query('requirements')
      .withIndex('by_feature', (q) => q.eq('feature_id', args.feature_id))
      .collect()

    return requirements.map((r) => toRequirement(r as Parameters<typeof toRequirement>[0]))
  },
})

/**
 * Get a single requirement by ID
 */
export const getRequirement = query({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args): Promise<Requirement | null> => {
    const req = await ctx.db.query('requirements').withIndex('by_uuid', (q) => q.eq('id', args.id)).unique()
    if (!req) return null
    return toRequirement(req as Parameters<typeof toRequirement>[0])
  },
})

// ============================================
// Requirement Mutations
// ============================================

/**
 * Create a new requirement
 */
export const createRequirement = mutation({
  args: {
    project_id: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    feature_id: v.optional(v.string()),
    category: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal('draft'),
      v.literal('approved'),
      v.literal('implemented'),
      v.literal('deferred')
    )),
    priority: v.optional(v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('urgent')
    )),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Requirement> => {
    const now = Date.now()

    // Get max position if not provided
    let position = args.position ?? 0
    if (args.position === undefined) {
      const existing = await ctx.db
        .query('requirements')
        .withIndex('by_project', (q) => q.eq('project_id', args.project_id))
        .collect()
      position = existing.length
    }

    const id = generateId()
    await ctx.db.insert('requirements', {
      id,
      project_id: args.project_id,
      feature_id: args.feature_id,
      title: args.title,
      description: args.description,
      category: args.category,
      status: args.status ?? 'draft',
      priority: args.priority ?? 'medium',
      position,
      created_at: now,
      updated_at: now,
    })

    const req = await ctx.db.query('requirements').withIndex('by_uuid', (q) => q.eq('id', id)).unique()
    return toRequirement(req as Parameters<typeof toRequirement>[0])
  },
})

/**
 * Update a requirement
 */
export const updateRequirement = mutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    feature_id: v.optional(v.string()),
    category: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal('draft'),
      v.literal('approved'),
      v.literal('implemented'),
      v.literal('deferred')
    )),
    priority: v.optional(v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('urgent')
    )),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Requirement> => {
    const { id, ...updates } = args
    const now = Date.now()

    const existing = await ctx.db.query('requirements').withIndex('by_uuid', (q) => q.eq('id', id)).unique()
    if (!existing) {
      throw new Error(`Requirement not found: ${id}`)
    }

    await ctx.db.patch(existing._id, {
      ...updates,
      updated_at: now,
    })

    const req = await ctx.db.query('requirements').withIndex('by_uuid', (q) => q.eq('id', id)).unique()
    return toRequirement(req as Parameters<typeof toRequirement>[0])
  },
})

/**
 * Delete a requirement
 */
export const deleteRequirement = mutation({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const req = await ctx.db.query('requirements').withIndex('by_uuid', (q) => q.eq('id', args.id)).unique()
    if (!req) {
      throw new Error(`Requirement not found: ${args.id}`)
    }

    // Delete phase requirement mappings
    const phaseReqs = await ctx.db
      .query('phaseRequirements')
      .withIndex('by_requirement', (q) => q.eq('requirement_id', args.id))
      .collect()

    for (const pr of phaseReqs) {
      await ctx.db.delete(pr._id)
    }

    await ctx.db.delete(req._id)
  },
})

// ============================================
// Roadmap Phase Queries
// ============================================

/**
 * Get all phases for a project
 */
export const getPhases = query({
  args: {
    project_id: v.string(),
  },
  handler: async (ctx, args): Promise<RoadmapPhase[]> => {
    const phases = await ctx.db
      .query('roadmapPhases')
      .withIndex('by_project_position', (q) => q.eq('project_id', args.project_id))
      .collect()

    return phases.map((p) => toRoadmapPhase(p as Parameters<typeof toRoadmapPhase>[0]))
  },
})

/**
 * Get a single phase by ID with its requirements
 */
export const getPhase = query({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args): Promise<{ phase: RoadmapPhase; requirements: Requirement[] } | null> => {
    const phase = await ctx.db.query('roadmapPhases').withIndex('by_uuid', (q) => q.eq('id', args.id)).unique()
    if (!phase) return null

    const phaseReqs = await ctx.db
      .query('phaseRequirements')
      .withIndex('by_phase', (q) => q.eq('phase_id', args.id))
      .collect()

    const requirements: Requirement[] = []
    for (const pr of phaseReqs) {
      const req = await ctx.db
        .query('requirements')
        .withIndex('by_uuid', (q) => q.eq('id', (pr as { requirement_id: string }).requirement_id))
        .unique()
      if (req) {
        requirements.push(toRequirement(req as Parameters<typeof toRequirement>[0]))
      }
    }

    return {
      phase: toRoadmapPhase(phase as Parameters<typeof toRoadmapPhase>[0]),
      requirements,
    }
  },
})

/**
 * Get full roadmap data for a project
 */
export const getRoadmap = query({
  args: {
    project_id: v.string(),
  },
  handler: async (ctx, args): Promise<{
    phases: RoadmapPhase[]
    requirements: Requirement[]
    phaseRequirements: PhaseRequirement[]
    coverage: {
      total: number
      mapped: number
      unmapped: string[]
    }
  }> => {
    const phases = await ctx.db
      .query('roadmapPhases')
      .withIndex('by_project_position', (q) => q.eq('project_id', args.project_id))
      .collect()

    const requirements = await ctx.db
      .query('requirements')
      .withIndex('by_project', (q) => q.eq('project_id', args.project_id))
      .collect()

    const phaseReqs = await ctx.db
      .query('phaseRequirements')
      .withIndex('by_project', (q) => q.eq('project_id', args.project_id))
      .collect()

    // Calculate coverage
    const mappedReqIds = new Set(phaseReqs.map((pr) => (pr as { requirement_id: string }).requirement_id))
    const unmapped = requirements
      .filter((r) => !mappedReqIds.has((r as { id: string }).id))
      .map((r) => (r as { id: string }).id)

    return {
      phases: phases.map((p) => toRoadmapPhase(p as Parameters<typeof toRoadmapPhase>[0])),
      requirements: requirements.map((r) => toRequirement(r as Parameters<typeof toRequirement>[0])),
      phaseRequirements: phaseReqs.map((pr) => toPhaseRequirement(pr as Parameters<typeof toPhaseRequirement>[0])),
      coverage: {
        total: requirements.length,
        mapped: mappedReqIds.size,
        unmapped,
      },
    }
  },
})

// ============================================
// Roadmap Phase Mutations
// ============================================

/**
 * Create a new phase
 */
export const createPhase = mutation({
  args: {
    project_id: v.string(),
    number: v.number(),
    name: v.string(),
    goal: v.string(),
    description: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal('draft'),
      v.literal('planned'),
      v.literal('in_progress'),
      v.literal('completed'),
      v.literal('deferred')
    )),
    depends_on: v.optional(v.array(v.string())),
    success_criteria: v.optional(v.array(v.string())),
    inserted: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<RoadmapPhase> => {
    const now = Date.now()

    // Calculate position based on number
    const existingPhases = await ctx.db
      .query('roadmapPhases')
      .withIndex('by_project', (q) => q.eq('project_id', args.project_id))
      .collect()

    const position = existingPhases.length

    const id = generateId()
    await ctx.db.insert('roadmapPhases', {
      id,
      project_id: args.project_id,
      number: args.number,
      name: args.name,
      goal: args.goal,
      description: args.description,
      status: args.status ?? 'draft',
      depends_on: args.depends_on ? JSON.stringify(args.depends_on) : undefined,
      success_criteria: args.success_criteria ? JSON.stringify(args.success_criteria) : undefined,
      position,
      inserted: args.inserted ?? false,
      created_at: now,
      updated_at: now,
    })

    const phase = await ctx.db.query('roadmapPhases').withIndex('by_uuid', (q) => q.eq('id', id)).unique()
    return toRoadmapPhase(phase as Parameters<typeof toRoadmapPhase>[0])
  },
})

/**
 * Update a phase
 */
export const updatePhase = mutation({
  args: {
    id: v.string(),
    number: v.optional(v.number()),
    name: v.optional(v.string()),
    goal: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal('draft'),
      v.literal('planned'),
      v.literal('in_progress'),
      v.literal('completed'),
      v.literal('deferred')
    )),
    depends_on: v.optional(v.array(v.string())),
    success_criteria: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<RoadmapPhase> => {
    const { id, depends_on, success_criteria, ...otherUpdates } = args
    const now = Date.now()

    const existing = await ctx.db.query('roadmapPhases').withIndex('by_uuid', (q) => q.eq('id', id)).unique()
    if (!existing) {
      throw new Error(`Phase not found: ${id}`)
    }

    const updates: Record<string, unknown> = { ...otherUpdates, updated_at: now }
    if (depends_on !== undefined) {
      updates.depends_on = JSON.stringify(depends_on)
    }
    if (success_criteria !== undefined) {
      updates.success_criteria = JSON.stringify(success_criteria)
    }

    await ctx.db.patch(existing._id, updates)

    const phase = await ctx.db.query('roadmapPhases').withIndex('by_uuid', (q) => q.eq('id', id)).unique()
    return toRoadmapPhase(phase as Parameters<typeof toRoadmapPhase>[0])
  },
})

/**
 * Delete a phase
 */
export const deletePhase = mutation({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const phase = await ctx.db.query('roadmapPhases').withIndex('by_uuid', (q) => q.eq('id', args.id)).unique()
    if (!phase) {
      throw new Error(`Phase not found: ${args.id}`)
    }

    // Delete phase requirement mappings
    const phaseReqs = await ctx.db
      .query('phaseRequirements')
      .withIndex('by_phase', (q) => q.eq('phase_id', args.id))
      .collect()

    for (const pr of phaseReqs) {
      await ctx.db.delete(pr._id)
    }

    await ctx.db.delete(phase._id)
  },
})

/**
 * Reorder phases
 */
export const reorderPhases = mutation({
  args: {
    project_id: v.string(),
    phase_ids: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now()

    for (let i = 0; i < args.phase_ids.length; i++) {
      const phase = await ctx.db
        .query('roadmapPhases')
        .withIndex('by_uuid', (q) => q.eq('id', args.phase_ids[i]))
        .unique()

      if (phase) {
        await ctx.db.patch(phase._id, {
          position: i,
          updated_at: now,
        })
      }
    }
  },
})

// ============================================
// Phase Requirement Mutations
// ============================================

/**
 * Link a requirement to a phase
 */
export const linkRequirementToPhase = mutation({
  args: {
    phase_id: v.string(),
    requirement_id: v.string(),
    project_id: v.string(),
  },
  handler: async (ctx, args): Promise<PhaseRequirement> => {
    const now = Date.now()

    // Check if already linked
    const existing = await ctx.db
      .query('phaseRequirements')
      .withIndex('by_phase_requirement', (q) =>
        q.eq('phase_id', args.phase_id).eq('requirement_id', args.requirement_id)
      )
      .unique()

    if (existing) {
      return toPhaseRequirement(existing as Parameters<typeof toPhaseRequirement>[0])
    }

    const id = generateId()
    await ctx.db.insert('phaseRequirements', {
      id,
      phase_id: args.phase_id,
      requirement_id: args.requirement_id,
      project_id: args.project_id,
      created_at: now,
    })

    const pr = await ctx.db.query('phaseRequirements').withIndex('by_uuid', (q) => q.eq('id', id)).unique()
    return toPhaseRequirement(pr as Parameters<typeof toPhaseRequirement>[0])
  },
})

/**
 * Unlink a requirement from a phase
 */
export const unlinkRequirementFromPhase = mutation({
  args: {
    phase_id: v.string(),
    requirement_id: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db
      .query('phaseRequirements')
      .withIndex('by_phase_requirement', (q) =>
        q.eq('phase_id', args.phase_id).eq('requirement_id', args.requirement_id)
      )
      .unique()

    if (existing) {
      await ctx.db.delete(existing._id)
    }
  },
})

// ============================================
// Roadmap Generation
// ============================================

/**
 * Generate phases from requirements using GSD logic
 * This creates an initial roadmap structure based on requirement categories
 */
export const generateRoadmap = mutation({
  args: {
    project_id: v.string(),
    depth: v.optional(v.union(v.literal('quick'), v.literal('standard'), v.literal('comprehensive'))),
  },
  handler: async (ctx, args): Promise<{ phases: RoadmapPhase[]; coverage: { total: number; mapped: number; unmapped: string[] } }> => {
    const requirements = await ctx.db
      .query('requirements')
      .withIndex('by_project', (q) => q.eq('project_id', args.project_id))
      .collect()

    if (requirements.length === 0) {
      throw new Error('No requirements found for this project')
    }

    // Group requirements by category
    const byCategory = new Map<string, typeof requirements>()
    for (const req of requirements) {
      const category = (req as { category?: string }).category || 'General'
      if (!byCategory.has(category)) {
        byCategory.set(category, [])
      }
      byCategory.get(category)!.push(req)
    }

    // Determine target phase count based on depth
    const depth = args.depth ?? 'standard'
    const targetPhases = depth === 'quick' ? 3 : depth === 'comprehensive' ? 8 : 5

    // Simple phase generation strategy:
    // 1. Foundation phase (always first)
    // 2. Group by category
    // 3. Polish phase (always last)

    const categories = Array.from(byCategory.keys())
    const now = Date.now()
    const createdPhases: RoadmapPhase[] = []

    // Phase 1: Foundation
    const foundationId = generateId()
    await ctx.db.insert('roadmapPhases', {
      id: foundationId,
      project_id: args.project_id,
      number: 1,
      name: 'Foundation',
      goal: 'Establish project foundation and core infrastructure',
      status: 'draft',
      success_criteria: JSON.stringify([
        'Project structure is set up and buildable',
        'Core dependencies are installed and configured',
        'Development environment is documented',
      ]),
      position: 0,
      inserted: false,
      created_at: now,
      updated_at: now,
    })

    createdPhases.push(
      toRoadmapPhase(await ctx.db.query('roadmapPhases').withIndex('by_uuid', (q) => q.eq('id', foundationId)).unique() as Parameters<typeof toRoadmapPhase>[0])
    )

    // Create phases for each category
    let phaseNum = 2
    const categoryOrder = ['SETUP', 'AUTH', 'CORE', 'CONTENT', 'SOCIAL', 'INTEGRATION', 'API', 'UI', 'UX']
    const sortedCategories = categories.sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a.toUpperCase())
      const bIndex = categoryOrder.indexOf(b.toUpperCase())
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })

    // Limit categories based on depth
    const categoriesToUse = sortedCategories.slice(0, Math.max(1, targetPhases - 2))

    for (const category of categoriesToUse) {
      const catReqs = byCategory.get(category)!
      const phaseId = generateId()

      await ctx.db.insert('roadmapPhases', {
        id: phaseId,
        project_id: args.project_id,
        number: phaseNum,
        name: category,
        goal: `Deliver ${category.toLowerCase()} capabilities`,
        status: 'draft',
        success_criteria: JSON.stringify([
          `${catReqs.length} requirement${catReqs.length > 1 ? 's' : ''} implemented`,
          `Users can interact with ${category.toLowerCase()} features`,
        ]),
        depends_on: phaseNum > 2 ? JSON.stringify([createdPhases[createdPhases.length - 1].id]) : undefined,
        position: createdPhases.length,
        inserted: false,
        created_at: now,
        updated_at: now,
      })

      // Link requirements to this phase
      for (const req of catReqs) {
        const prId = generateId()
        await ctx.db.insert('phaseRequirements', {
          id: prId,
          phase_id: phaseId,
          requirement_id: (req as { id: string }).id,
          project_id: args.project_id,
          created_at: now,
        })
      }

      createdPhases.push(
        toRoadmapPhase(await ctx.db.query('roadmapPhases').withIndex('by_uuid', (q) => q.eq('id', phaseId)).unique() as Parameters<typeof toRoadmapPhase>[0])
      )
      phaseNum++
    }

    // Final phase: Polish/Deploy
    const polishId = generateId()
    await ctx.db.insert('roadmapPhases', {
      id: polishId,
      project_id: args.project_id,
      number: phaseNum,
      name: 'Polish & Deploy',
      goal: 'Prepare for production release',
      status: 'draft',
      success_criteria: JSON.stringify([
        'All critical bugs resolved',
        'Performance optimizations applied',
        'Documentation complete',
        'Ready for production deployment',
      ]),
      depends_on: createdPhases.length > 0 ? JSON.stringify([createdPhases[createdPhases.length - 1].id]) : undefined,
      position: createdPhases.length,
      inserted: false,
      created_at: now,
      updated_at: now,
    })

    createdPhases.push(
      toRoadmapPhase(await ctx.db.query('roadmapPhases').withIndex('by_uuid', (q) => q.eq('id', polishId)).unique() as Parameters<typeof toRoadmapPhase>[0])
    )

    // Calculate coverage
    const allPhaseReqs = await ctx.db
      .query('phaseRequirements')
      .withIndex('by_project', (q) => q.eq('project_id', args.project_id))
      .collect()

    const mappedReqIds = new Set(allPhaseReqs.map((pr) => (pr as { requirement_id: string }).requirement_id))
    const unmapped = requirements
      .filter((r) => !mappedReqIds.has((r as { id: string }).id))
      .map((r) => (r as { id: string }).id)

    return {
      phases: createdPhases,
      coverage: {
        total: requirements.length,
        mapped: mappedReqIds.size,
        unmapped,
      },
    }
  },
})

/**
 * Export roadmap as structured data for task breakdown
 */
export const exportRoadmap = query({
  args: {
    project_id: v.string(),
  },
  handler: async (ctx, args): Promise<{
    phases: Array<{
      id: string
      number: number
      name: string
      goal: string
      description: string | null
      success_criteria: string[]
      requirements: Array<{
        id: string
        title: string
        category: string | null
        description: string | null
      }>
    }>
    coverage: {
      total: number
      mapped: number
      percentage: number
    }
  }> => {
    const phases = await ctx.db
      .query('roadmapPhases')
      .withIndex('by_project_position', (q) => q.eq('project_id', args.project_id))
      .collect()

    const requirements = await ctx.db
      .query('requirements')
      .withIndex('by_project', (q) => q.eq('project_id', args.project_id))
      .collect()

    const phaseReqs = await ctx.db
      .query('phaseRequirements')
      .withIndex('by_project', (q) => q.eq('project_id', args.project_id))
      .collect()

    const reqMap = new Map(requirements.map((r) => [(r as { id: string }).id, r as { id: string; title: string; category?: string; description?: string }]))
    const reqsByPhase = new Map<string, string[]>()

    for (const pr of phaseReqs) {
      const phaseId = (pr as { phase_id: string }).phase_id
      const reqId = (pr as { requirement_id: string }).requirement_id
      if (!reqsByPhase.has(phaseId)) {
        reqsByPhase.set(phaseId, [])
      }
      reqsByPhase.get(phaseId)!.push(reqId)
    }

    const result = []
    for (const phase of phases) {
      const p = phase as { id: string; number: number; name: string; goal: string; description?: string; success_criteria?: string }
      const reqIds = reqsByPhase.get(p.id) ?? []
      const phaseRequirements = reqIds
        .map((id) => reqMap.get(id))
        .filter((r): r is { id: string; title: string; category?: string; description?: string } => !!r)
        .map((r) => ({
          id: r.id,
          title: r.title,
          category: r.category ?? null,
          description: r.description ?? null,
        }))

      result.push({
        id: p.id,
        number: p.number,
        name: p.name,
        goal: p.goal,
        description: p.description ?? null,
        success_criteria: p.success_criteria ? JSON.parse(p.success_criteria) : [],
        requirements: phaseRequirements,
      })
    }

    const total = requirements.length
    const mapped = new Set(phaseReqs.map((pr) => (pr as { requirement_id: string }).requirement_id)).size

    return {
      phases: result,
      coverage: {
        total,
        mapped,
        percentage: total > 0 ? Math.round((mapped / total) * 100) : 0,
      },
    }
  },
})

/**
 * Validate roadmap coverage
 */
export const validateCoverage = query({
  args: {
    project_id: v.string(),
  },
  handler: async (ctx, args): Promise<{
    valid: boolean
    total: number
    mapped: number
    unmapped: Requirement[]
    percentage: number
  }> => {
    const requirements = await ctx.db
      .query('requirements')
      .withIndex('by_project', (q) => q.eq('project_id', args.project_id))
      .collect()

    const phaseReqs = await ctx.db
      .query('phaseRequirements')
      .withIndex('by_project', (q) => q.eq('project_id', args.project_id))
      .collect()

    const mappedReqIds = new Set(phaseReqs.map((pr) => (pr as { requirement_id: string }).requirement_id))
    const unmappedDocs = requirements.filter((r) => !mappedReqIds.has((r as { id: string }).id))
    const mapped = mappedReqIds.size
    const total = requirements.length

    return {
      valid: unmappedDocs.length === 0,
      total,
      mapped,
      unmapped: unmappedDocs.map((r) => toRequirement(r as Parameters<typeof toRequirement>[0])),
      percentage: total > 0 ? Math.round((mapped / total) * 100) : 0,
    }
  },
})
