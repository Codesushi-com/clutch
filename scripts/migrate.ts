import { db } from "../lib/db"
import fs from "fs"
import path from "path"

const schemaPath = path.join(__dirname, "../lib/db/schema.sql")
const schema = fs.readFileSync(schemaPath, "utf-8")

console.log("Running migrations...")
console.log(`Database: ${db.name}`)

db.exec(schema)

// Migration: Add dispatch columns to tasks (if not exists)
const addColumnIfNotExists = (table: string, column: string, type: string) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!columns.find(c => c.name === column)) {
    console.log(`  Adding column ${table}.${column}...`)
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
}

console.log("\nChecking for schema updates...")
addColumnIfNotExists("tasks", "dispatch_status", "TEXT")
addColumnIfNotExists("tasks", "dispatch_requested_at", "INTEGER")
addColumnIfNotExists("tasks", "dispatch_requested_by", "TEXT")

// Verify tables exist
const tables = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all() as { name: string }[]

console.log(`\n✓ Created ${tables.length} tables:`)
tables.forEach(t => console.log(`  - ${t.name}`))

console.log("\n✓ Database initialized successfully")
