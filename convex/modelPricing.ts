import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

/**
 * Model pricing data - cost per 1M tokens in USD
 * These are the current rates for models used in the system.
 * Update these values when provider pricing changes.
 */
const DEFAULT_PRICING = [
  {
    model: "anthropic/claude-sonnet-4-20250514",
    input_per_1m: 3.0,
    output_per_1m: 15.0,
  },
  {
    model: "anthropic/claude-haiku-4-5",
    input_per_1m: 0.8,
    output_per_1m: 4.0,
  },
  {
    model: "moonshot/kimi-for-coding",
    input_per_1m: 0.6,
    output_per_1m: 0.6,
  },
  {
    model: "openrouter/pony-alpha",
    input_per_1m: 3.0,
    output_per_1m: 15.0,
  },
]

/**
 * Seed or update model pricing data.
 * Can be re-run to update rates when providers change pricing.
 * Uses upsert pattern: updates existing, inserts new.
 */
export const seedModelPricing = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const results = { inserted: 0, updated: 0 }

    for (const pricing of DEFAULT_PRICING) {
      // Check if this model already exists
      const existing = await ctx.db
        .query("model_pricing")
        .withIndex("by_model", (q) => q.eq("model", pricing.model))
        .first()

      if (existing) {
        // Update existing record
        await ctx.db.patch(existing._id, {
          input_per_1m: pricing.input_per_1m,
          output_per_1m: pricing.output_per_1m,
          updated_at: now,
        })
        results.updated++
      } else {
        // Insert new record with generated UUID
        const id = crypto.randomUUID()
        await ctx.db.insert("model_pricing", {
          id,
          model: pricing.model,
          input_per_1m: pricing.input_per_1m,
          output_per_1m: pricing.output_per_1m,
          updated_at: now,
        })
        results.inserted++
      }
    }

    return results
  },
})

/**
 * Get pricing for a specific model.
 */
export const getModelPricing = query({
  args: { model: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("model_pricing")
      .withIndex("by_model", (q) => q.eq("model", args.model))
      .first()
  },
})

/**
 * Get pricing for a model by its ID.
 * Used when you have the internal Convex document ID.
 */
export const getModelPricingById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("model_pricing")
      .withIndex("by_uuid", (q) => q.eq("id", args.id))
      .first()
  },
})

/**
 * List all model pricing data.
 */
export const listModelPricing = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("model_pricing").collect()
  },
})

/**
 * Add or update a single model's pricing.
 * For admin use or dynamic pricing updates.
 */
export const upsertModelPricing = mutation({
  args: {
    model: v.string(),
    input_per_1m: v.number(),
    output_per_1m: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existing = await ctx.db
      .query("model_pricing")
      .withIndex("by_model", (q) => q.eq("model", args.model))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        input_per_1m: args.input_per_1m,
        output_per_1m: args.output_per_1m,
        updated_at: now,
      })
      return { id: existing._id, action: "updated" }
    } else {
      const id = crypto.randomUUID()
      await ctx.db.insert("model_pricing", {
        id,
        model: args.model,
        input_per_1m: args.input_per_1m,
        output_per_1m: args.output_per_1m,
        updated_at: now,
      })
      return { id, action: "inserted" }
    }
  },
})
