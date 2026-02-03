import Database from "better-sqlite3"
import fs from "fs"
import path from "path"

const dbPath = process.env.DATABASE_PATH || 
  path.join(process.env.HOME || "", ".trap", "trap.db")

// Ensure directory exists
const dir = path.dirname(dbPath)
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true })
}

export const db = new Database(dbPath)
db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

export type { Database } from "better-sqlite3"
