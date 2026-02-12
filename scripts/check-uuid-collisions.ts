#!/usr/bin/env tsx
/**
 * Check for UUID collisions in seed-demo.ts with fixed seed ranges
 */

// Seeded random number generator for deterministic output
class SeededRNG {
  private seed: number

  constructor(seed: number) {
    this.seed = seed
  }

  next(): number {
    // Linear congruential generator
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296
    return this.seed / 4294967296
  }

  range(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }
}

// Helper to generate UUID v4 (deterministic based on seed)
function generateUUID(seed: number): string {
  const hex = "0123456789abcdef"
  let uuid = ""
  const seededRNG = new SeededRNG(seed)
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += "-"
    } else if (i === 14) {
      uuid += "4"
    } else if (i === 19) {
      uuid += hex[seededRNG.range(8, 11)]
    } else {
      uuid += hex[seededRNG.range(0, 15)]
    }
  }
  return uuid
}

// Seed range constants - must match seed-demo.ts
const SEED_RANGES = {
  projects: { start: 1000, count: 10 },
  workLoopStates: { start: 2000, count: 10 },
  tasks: { start: 3000, count: 100 },
  dependencies: { start: 4000, count: 50 },
  comments: { start: 5000, count: 200 },
  chats: { start: 6000, count: 20 },
  chatMessages: { start: 7000, count: 2000 },
  workLoopRuns: { start: 10000, count: 200 },
  sessions: { start: 11000, count: 200 },
  phases: { start: 12000, count: 50 },
  features: { start: 13000, count: 500 },
  requirements: { start: 20000, count: 5000 },
  promptVersions: { start: 30000, count: 100 },
  taskAnalyses: { start: 40000, count: 10000 },
  promptMetrics: { start: 50000, count: 100 },
  notifications: { start: 60000, count: 50 },
  events: { start: 70000, count: 100 },
  signals: { start: 80000, count: 50 },
  modelPricing: { start: 90000, count: 10 },
  taskEvents: { start: 100000, count: 100 },
} as const

// Collect all UUIDs with their context
const uuids = new Map<string, Array<{entity: string, seed: number}>>()

function addUUID(seed: number, entity: string) {
  const uuid = generateUUID(seed)
  if (!uuids.has(uuid)) {
    uuids.set(uuid, [])
  }
  uuids.get(uuid)!.push({entity, seed})
}

console.log("Generating UUIDs for all entities with FIXED seed ranges...\n")

const PROJECTS = ["acme-api", "pixel-ui", "data-pipeline", "mobile-app"]
const PHASES = ["Foundation", "API Layer", "Frontend", "Integration"]
const PROMPT_ROLES = ["dev", "pm", "qa", "researcher", "reviewer", "pe", "analyzer"]
const PERIODS = ["day", "week", "all_time"]

// 1. Projects
for (let i = 0; i < PROJECTS.length; i++) {
  addUUID(SEED_RANGES.projects.start + i, `project[${PROJECTS[i]}]`)
}

// 2. Work loop states
for (let i = 0; i < PROJECTS.length; i++) {
  addUUID(SEED_RANGES.workLoopStates.start + i, `workLoopState[${PROJECTS[i]}]`)
}

// 3. Tasks (50 max)
for (let i = 0; i < 50; i++) {
  addUUID(SEED_RANGES.tasks.start + i, `task[${i}]`)
}

// 4. Dependencies (15 max)
for (let i = 0; i < 15; i++) {
  addUUID(SEED_RANGES.dependencies.start + i, `dependency[${i}]`)
}

// 5. Comments (80 max)
for (let i = 0; i < 80; i++) {
  addUUID(SEED_RANGES.comments.start + i, `comment[${i}]`)
}

// 6. Chats (8 total - 2 per project)
for (let i = 0; i < 8; i++) {
  addUUID(SEED_RANGES.chats.start + i, `chat[${i}]`)
}

// 7. Chat messages (8 chats * max 15 messages = 120)
for (let i = 0; i < 8; i++) {
  for (let j = 0; j < 15; j++) {
    addUUID(SEED_RANGES.chatMessages.start + i * 100 + j, `chatMessage[chat=${i},msg=${j}]`)
  }
}

// 8. Work loop runs (100)
for (let i = 0; i < 100; i++) {
  addUUID(SEED_RANGES.workLoopRuns.start + i, `workLoopRun[${i}]`)
}

// 9. Sessions (max 50 in_progress + 12 additional = 62, plus 62 session_ids)
for (let i = 0; i < 62; i++) {
  addUUID(SEED_RANGES.sessions.start + i, `session[${i}]`)
  addUUID(SEED_RANGES.sessions.start + 100 + i, `session.session_id[${i}]`)
}

// 10. Phases (4 projects * 4 phases = 16)
for (let pIdx = 0; pIdx < PROJECTS.length; pIdx++) {
  for (let i = 0; i < PHASES.length; i++) {
    addUUID(SEED_RANGES.phases.start + pIdx * 10 + i, `phase[project=${pIdx},phase=${i}]`)
  }
}

// 11. Features (4 projects * 4 phases * 4 max features = 64)
for (let pIdx = 0; pIdx < PROJECTS.length; pIdx++) {
  for (let i = 0; i < PHASES.length; i++) {
    for (let j = 0; j < 4; j++) {
      addUUID(SEED_RANGES.features.start + pIdx * 100 + i * 10 + j, `feature[project=${pIdx},phase=${i},feature=${j}]`)
    }
  }
}

// 12. Requirements (4 projects * 4 phases * 4 features * 5 max reqs = 320)
for (let pIdx = 0; pIdx < PROJECTS.length; pIdx++) {
  for (let i = 0; i < PHASES.length; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 5; k++) {
        addUUID(SEED_RANGES.requirements.start + pIdx * 1000 + i * 100 + j * 10 + k, `req[project=${pIdx},phase=${i},feature=${j},req=${k}]`)
      }
    }
  }
}

// 13. Prompt versions (7 roles * 5 max versions = 35)
for (let rIdx = 0; rIdx < PROMPT_ROLES.length; rIdx++) {
  for (let i = 0; i < 5; i++) {
    addUUID(SEED_RANGES.promptVersions.start + rIdx * 10 + i, `promptVersion[role=${PROMPT_ROLES[rIdx]},ver=${i}]`)
  }
}

// 14. Task analyses (7 roles * 4 versions * 15 max analyses = 420)
for (let rIdx = 0; rIdx < PROMPT_ROLES.length; rIdx++) {
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 15; j++) {
      addUUID(SEED_RANGES.taskAnalyses.start + rIdx * 1000 + i * 100 + j, `taskAnalysis[role=${PROMPT_ROLES[rIdx]},ver=${i},analysis=${j}]`)
    }
  }
}

// 15. Prompt metrics (7 roles * 3 periods = 21)
for (let rIdx = 0; rIdx < PROMPT_ROLES.length; rIdx++) {
  for (let pIdx = 0; pIdx < PERIODS.length; pIdx++) {
    addUUID(SEED_RANGES.promptMetrics.start + rIdx * 10 + pIdx, `promptMetric[role=${PROMPT_ROLES[rIdx]},period=${PERIODS[pIdx]}]`)
  }
}

// 16. Notifications (25 max)
for (let i = 0; i < 25; i++) {
  addUUID(SEED_RANGES.notifications.start + i, `notification[${i}]`)
}

// 17. Events (50 max)
for (let i = 0; i < 50; i++) {
  addUUID(SEED_RANGES.events.start + i, `event[${i}]`)
}

// 18. Signals (15 max)
for (let i = 0; i < 15; i++) {
  addUUID(SEED_RANGES.signals.start + i, `signal[${i}]`)
}

// 19. Model pricing (5)
for (let i = 0; i < 5; i++) {
  addUUID(SEED_RANGES.modelPricing.start + i, `modelPricing[${i}]`)
}

// 20. Task events (60 max)
for (let i = 0; i < 60; i++) {
  addUUID(SEED_RANGES.taskEvents.start + i, `taskEvent[${i}]`)
}

// Check for duplicates
console.log("Checking for duplicate UUIDs...\n")
let duplicatesFound = false
const duplicateCount = Array.from(uuids.values()).filter(contexts => contexts.length > 1).length

for (const [uuid, contexts] of uuids.entries()) {
  if (contexts.length > 1) {
    duplicatesFound = true
    console.log(`DUPLICATE UUID: ${uuid}`)
    for (const ctx of contexts) {
      console.log(`  - ${ctx.entity} (seed ${ctx.seed})`)
    }
    console.log()
  }
}

if (!duplicatesFound) {
  console.log("✅ No duplicate UUIDs found!")
} else {
  console.log(`❌ Found ${duplicateCount} duplicate UUID(s)`)
  process.exit(1)
}

// Check seed range overlaps
console.log("\nVerifying seed range allocations...")
const ranges = Object.entries(SEED_RANGES).map(([name, {start, count}]) => ({
  name,
  start,
  end: start + count - 1
}))

let overlapsFound = false
for (let i = 0; i < ranges.length; i++) {
  for (let j = i + 1; j < ranges.length; j++) {
    const r1 = ranges[i]
    const r2 = ranges[j]
    if (r1.start <= r2.end && r2.start <= r1.end) {
      console.log(`❌ Overlap: ${r1.name} (${r1.start}-${r1.end}) overlaps with ${r2.name} (${r2.start}-${r2.end})`)
      overlapsFound = true
    }
  }
}

if (!overlapsFound) {
  console.log("✅ No seed range overlaps detected!")
}

// Check project UUIDs
console.log("\n\nProject UUIDs:")
for (let i = 0; i < PROJECTS.length; i++) {
  console.log(`  ${PROJECTS[i]}: ${generateUUID(SEED_RANGES.projects.start + i)} (seed ${SEED_RANGES.projects.start + i})`)
}