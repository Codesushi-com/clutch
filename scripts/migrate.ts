import { db } from "../lib/db"
import fs from "fs"
import path from "path"

const schemaPath = path.join(__dirname, "../lib/db/schema.sql")
const schema = fs.readFileSync(schemaPath, "utf-8")

console.log("Running migrations...")
console.log(`Database: ${db.name}`)

db.exec(schema)

// Verify tables exist
const tables = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all() as { name: string }[]

console.log(`\n✓ Created ${tables.length} tables:`)
tables.forEach(t => console.log(`  - ${t.name}`))

console.log("\n✓ Database initialized successfully")
