/**
 * One-shot migration: SQLite → Convex (self-hosted)
 * 
 * Copies all data from SQLite to Convex, preserving UUIDs as string IDs.
 * Convex schema uses v.string() for all IDs and foreign keys.
 * 
 * Usage: cd /home/dan/src/trap && npx tsx scripts/migrate-sqlite-to-convex.ts
 */

import Database from "better-sqlite3"
import path from "path"
import { ConvexHttpClient } from "convex/browser"
import { api } from "../convex/_generated/api.js"

const DB_PATH = process.env.DATABASE_PATH || 
  path.join(process.env.HOME || "", ".trap", "trap.db")

const CONVEX_URL = process.env.CONVEX_SELF_HOSTED_URL || "http://127.0.0.1:3210"

const db = new Database(DB_PATH, { readonly: true })
const convex = new ConvexHttpClient(CONVEX_URL, { skipConvexDeploymentUrlCheck: true })

// Helper: convert SQLite boolean (0/1) to JS boolean
function toBool(val: number | null | undefined): boolean {
  return val === 1 || val === true
}

async function migrateProjects() {
  const rows = db.prepare("SELECT * FROM projects").all() as Record<string, unknown>[]
  console.log(`Migrating ${rows.length} projects...`)
  
  for (const row of rows) {
    await convex.mutation(api.seed.insertProject, {
      id: row.id as string,
      slug: row.slug as string,
      name: row.name as string,
      description: (row.description as string) || undefined,
      color: (row.color as string) || "#3b82f6",
      repo_url: (row.repo_url as string) || undefined,
      context_path: (row.context_path as string) || undefined,
      local_path: (row.local_path as string) || undefined,
      github_repo: (row.github_repo as string) || undefined,
      chat_layout: (row.chat_layout as string) === "imessage" ? "imessage" : "slack",
      work_loop_enabled: toBool(row.work_loop_enabled as number),
      work_loop_schedule: (row.work_loop_schedule as string) || "*/5 * * * *",
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    })
  }
  console.log(`  ✓ ${rows.length} projects migrated`)
}

async function migrateTasks() {
  const rows = db.prepare("SELECT * FROM tasks").all() as Record<string, unknown>[]
  console.log(`Migrating ${rows.length} tasks...`)
  
  for (const row of rows) {
    // Normalize status - SQLite might have "in_review" which we now support
    let status = row.status as string
    if (!["backlog", "ready", "in_progress", "in_review", "review", "done"].includes(status)) {
      status = "backlog"
    }
    
    let priority = row.priority as string
    if (!["low", "medium", "high", "urgent"].includes(priority)) {
      priority = "medium"
    }

    await convex.mutation(api.seed.insertTask, {
      id: row.id as string,
      project_id: row.project_id as string,
      title: row.title as string,
      description: (row.description as string) || undefined,
      status,
      priority,
      role: (row.role as string) || undefined,
      assignee: (row.assignee as string) || undefined,
      requires_human_review: toBool(row.requires_human_review as number),
      tags: (row.tags as string) || undefined,
      session_id: (row.session_id as string) || undefined,
      dispatch_status: (row.dispatch_status as string) || undefined,
      dispatch_requested_at: (row.dispatch_requested_at as number) || undefined,
      dispatch_requested_by: (row.dispatch_requested_by as string) || undefined,
      position: (row.position as number) ?? 0,
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
      completed_at: (row.completed_at as number) || undefined,
    })
  }
  console.log(`  ✓ ${rows.length} tasks migrated`)
}

async function migrateComments() {
  const rows = db.prepare("SELECT * FROM comments").all() as Record<string, unknown>[]
  console.log(`Migrating ${rows.length} comments...`)
  
  for (const row of rows) {
    await convex.mutation(api.seed.insertComment, {
      id: row.id as string,
      task_id: row.task_id as string,
      author: row.author as string,
      author_type: (row.author_type as string) || "agent",
      content: row.content as string,
      type: (row.type as string) || "message",
      responded_at: (row.responded_at as number) || undefined,
      created_at: row.created_at as number,
    })
  }
  console.log(`  ✓ ${rows.length} comments migrated`)
}

async function migrateChats() {
  const rows = db.prepare("SELECT * FROM chats").all() as Record<string, unknown>[]
  console.log(`Migrating ${rows.length} chats...`)
  
  for (const row of rows) {
    await convex.mutation(api.seed.insertChat, {
      id: row.id as string,
      project_id: row.project_id as string,
      title: row.title as string,
      participants: (row.participants as string) || undefined,
      session_key: (row.session_key as string) || undefined,
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    })
  }
  console.log(`  ✓ ${rows.length} chats migrated`)
}

async function migrateChatMessages() {
  const rows = db.prepare("SELECT * FROM chat_messages").all() as Record<string, unknown>[]
  console.log(`Migrating ${rows.length} chat messages...`)
  
  for (const row of rows) {
    await convex.mutation(api.seed.insertChatMessage, {
      id: row.id as string,
      chat_id: row.chat_id as string,
      author: row.author as string,
      content: row.content as string,
      run_id: (row.run_id as string) || undefined,
      session_key: (row.session_key as string) || undefined,
      is_automated: row.is_automated ? toBool(row.is_automated as number) : undefined,
      created_at: row.created_at as number,
    })
  }
  console.log(`  ✓ ${rows.length} chat messages migrated`)
}

async function migrateNotifications() {
  const rows = db.prepare("SELECT * FROM notifications").all() as Record<string, unknown>[]
  console.log(`Migrating ${rows.length} notifications...`)
  
  for (const row of rows) {
    await convex.mutation(api.seed.insertNotification, {
      id: row.id as string,
      task_id: (row.task_id as string) || undefined,
      project_id: (row.project_id as string) || undefined,
      type: (row.type as string) || "system",
      severity: (row.severity as string) || "info",
      title: row.title as string,
      message: row.message as string,
      agent: (row.agent as string) || undefined,
      read: toBool(row.read as number),
      created_at: row.created_at as number,
    })
  }
  console.log(`  ✓ ${rows.length} notifications migrated`)
}

async function migrateEvents() {
  const rows = db.prepare("SELECT * FROM events").all() as Record<string, unknown>[]
  console.log(`Migrating ${rows.length} events...`)
  
  for (const row of rows) {
    await convex.mutation(api.seed.insertEvent, {
      id: row.id as string,
      project_id: (row.project_id as string) || undefined,
      task_id: (row.task_id as string) || undefined,
      type: row.type as string,
      actor: row.actor as string,
      data: (row.data as string) || undefined,
      created_at: row.created_at as number,
    })
  }
  console.log(`  ✓ ${rows.length} events migrated`)
}

async function migrateSignals() {
  const rows = db.prepare("SELECT * FROM signals").all() as Record<string, unknown>[]
  console.log(`Migrating ${rows.length} signals...`)
  
  for (const row of rows) {
    await convex.mutation(api.seed.insertSignal, {
      id: row.id as string,
      task_id: row.task_id as string,
      session_key: row.session_key as string,
      agent_id: row.agent_id as string,
      kind: row.kind as string,
      severity: (row.severity as string) || "normal",
      message: row.message as string,
      blocking: toBool(row.blocking as number),
      responded_at: (row.responded_at as number) || undefined,
      response: (row.response as string) || undefined,
      created_at: row.created_at as number,
    })
  }
  console.log(`  ✓ ${rows.length} signals migrated`)
}

async function migrateTaskDependencies() {
  const rows = db.prepare("SELECT * FROM task_dependencies").all() as Record<string, unknown>[]
  console.log(`Migrating ${rows.length} task dependencies...`)
  
  for (const row of rows) {
    await convex.mutation(api.seed.insertTaskDependency, {
      id: row.id as string,
      task_id: row.task_id as string,
      depends_on_id: row.depends_on_id as string,
      created_at: row.created_at as number,
    })
  }
  console.log(`  ✓ ${rows.length} task dependencies migrated`)
}

async function main() {
  console.log("=== SQLite → Convex Migration ===")
  console.log(`SQLite: ${DB_PATH}`)
  console.log(`Convex: ${CONVEX_URL}`)
  console.log()

  // Order matters: projects first (referenced by tasks, chats, etc.)
  await migrateProjects()
  await migrateTasks()
  await migrateComments()
  await migrateChats()
  await migrateChatMessages()
  await migrateNotifications()
  await migrateEvents()
  await migrateSignals()
  await migrateTaskDependencies()

  console.log()
  console.log("=== Migration complete! ===")
  
  db.close()
}

main().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
