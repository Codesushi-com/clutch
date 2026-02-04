import { db } from "../lib/db"
import fs from "fs"
import path from "path"

// Migration: Add columns to tasks (if not exists) - MUST run before schema.sql
const addColumnIfNotExists = (table: string, column: string, type: string) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!columns.find(c => c.name === column)) {
    console.log(`  Adding column ${table}.${column}...`)
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
}

console.log("Running migrations...")
console.log(`Database: ${db.name}`)

console.log("\nChecking for schema updates...")
addColumnIfNotExists("tasks", "dispatch_status", "TEXT")
addColumnIfNotExists("tasks", "dispatch_requested_at", "INTEGER")
addColumnIfNotExists("tasks", "dispatch_requested_by", "TEXT")
addColumnIfNotExists("tasks", "position", "INTEGER DEFAULT 0")
addColumnIfNotExists("chats", "session_key", "TEXT")
addColumnIfNotExists("chat_messages", "run_id", "TEXT")

// Now run schema.sql for new tables and indexes
const schemaPath = path.join(__dirname, "../lib/db/schema.sql")
const schema = fs.readFileSync(schemaPath, "utf-8")

db.exec(schema)

// Check if signals table exists, create if not
const signalsTable = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name='signals'
`).get() as { name: string } | undefined

if (!signalsTable) {
  console.log("  Creating signals table...")
  db.exec(`
    CREATE TABLE signals (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      session_key TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      severity TEXT DEFAULT 'normal',
      message TEXT NOT NULL,
      blocking INTEGER DEFAULT 1,
      responded_at INTEGER,
      response TEXT,
      created_at INTEGER NOT NULL
    );
    
    CREATE INDEX idx_signals_task ON signals(task_id);
    CREATE INDEX idx_signals_kind ON signals(kind);
    CREATE INDEX idx_signals_blocking ON signals(blocking);
    CREATE INDEX idx_signals_responded ON signals(responded_at);
    CREATE INDEX idx_signals_created ON signals(created_at DESC);
  `)
}

// Verify tables exist
const tables = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all() as { name: string }[]

console.log(`\n✓ Created ${tables.length} tables:`)
tables.forEach(t => console.log(`  - ${t.name}`))

console.log("\n✓ Database initialized successfully")
