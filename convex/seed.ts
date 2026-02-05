/**
 * Seed mutations for data migration from SQLite.
 * These are simple insert-only mutations used by the migration script.
 * They accept all fields including the SQLite UUID `id`.
 */
import { mutation } from "./_generated/server"
import { v } from "convex/values"

export const insertProject = mutation({
  args: {
    id: v.string(),
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.string(),
    repo_url: v.optional(v.string()),
    context_path: v.optional(v.string()),
    local_path: v.optional(v.string()),
    github_repo: v.optional(v.string()),
    chat_layout: v.union(v.literal("slack"), v.literal("imessage")),
    work_loop_enabled: v.boolean(),
    work_loop_schedule: v.string(),
    created_at: v.number(),
    updated_at: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("projects", args)
  },
})

export const insertTask = mutation({
  args: {
    id: v.string(),
    project_id: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.string(),
    priority: v.string(),
    role: v.optional(v.string()),
    assignee: v.optional(v.string()),
    requires_human_review: v.boolean(),
    tags: v.optional(v.string()),
    session_id: v.optional(v.string()),
    dispatch_status: v.optional(v.string()),
    dispatch_requested_at: v.optional(v.number()),
    dispatch_requested_by: v.optional(v.string()),
    position: v.number(),
    created_at: v.number(),
    updated_at: v.number(),
    completed_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("tasks", args as Parameters<typeof ctx.db.insert>[1])
  },
})

export const insertComment = mutation({
  args: {
    id: v.string(),
    task_id: v.string(),
    author: v.string(),
    author_type: v.string(),
    content: v.string(),
    type: v.string(),
    responded_at: v.optional(v.number()),
    created_at: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("comments", args as Parameters<typeof ctx.db.insert>[1])
  },
})

export const insertChat = mutation({
  args: {
    id: v.string(),
    project_id: v.string(),
    title: v.string(),
    participants: v.optional(v.string()),
    session_key: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("chats", args)
  },
})

export const insertChatMessage = mutation({
  args: {
    id: v.string(),
    chat_id: v.string(),
    author: v.string(),
    content: v.string(),
    run_id: v.optional(v.string()),
    session_key: v.optional(v.string()),
    is_automated: v.optional(v.boolean()),
    created_at: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("chatMessages", args)
  },
})

export const insertNotification = mutation({
  args: {
    id: v.string(),
    task_id: v.optional(v.string()),
    project_id: v.optional(v.string()),
    type: v.string(),
    severity: v.string(),
    title: v.string(),
    message: v.string(),
    agent: v.optional(v.string()),
    read: v.boolean(),
    created_at: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("notifications", args as Parameters<typeof ctx.db.insert>[1])
  },
})

export const insertEvent = mutation({
  args: {
    id: v.string(),
    project_id: v.optional(v.string()),
    task_id: v.optional(v.string()),
    type: v.string(),
    actor: v.string(),
    data: v.optional(v.string()),
    created_at: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("events", args as Parameters<typeof ctx.db.insert>[1])
  },
})

export const insertSignal = mutation({
  args: {
    id: v.string(),
    task_id: v.string(),
    session_key: v.string(),
    agent_id: v.string(),
    kind: v.string(),
    severity: v.string(),
    message: v.string(),
    blocking: v.boolean(),
    responded_at: v.optional(v.number()),
    response: v.optional(v.string()),
    created_at: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("signals", args as Parameters<typeof ctx.db.insert>[1])
  },
})

export const insertTaskDependency = mutation({
  args: {
    id: v.string(),
    task_id: v.string(),
    depends_on_id: v.string(),
    created_at: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("taskDependencies", args)
  },
})
