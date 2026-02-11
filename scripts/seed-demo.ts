#!/usr/bin/env tsx
/**
 * Demo seed script for OpenClutch
 *
 * Populates the demo Convex instance with realistic-looking data
 * suitable for README screenshots and UI demonstrations.
 *
 * Usage:
 *   pnpm demo:seed          # Seed with demo data
 *   pnpm demo:seed --clean  # Clear existing data first
 *   pnpm demo:seed --url http://localhost:3230  # Custom Convex URL
 */

import { ConvexHttpClient } from "convex/browser"
import { api } from "../convex/_generated/api.js"

// Parse command line arguments
const args = process.argv.slice(2)
const shouldClean = args.includes("--clean")
const urlIndex = args.indexOf("--url")
const convexUrl = urlIndex >= 0 ? args[urlIndex + 1] : process.env.CONVEX_URL || "http://localhost:3230"

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

  pick<T>(arr: readonly T[]): T {
    return arr[this.range(0, arr.length - 1)]
  }

  pickMany<T>(arr: readonly T[], count: number): T[] {
    const shuffled = [...arr].sort(() => this.next() - 0.5)
    return shuffled.slice(0, count)
  }

  boolean(probability = 0.5): boolean {
    return this.next() < probability
  }

  dateInRange(startDaysAgo: number, endDaysAgo: number): number {
    const now = Date.now()
    const start = now - startDaysAgo * 24 * 60 * 60 * 1000
    const end = now - endDaysAgo * 24 * 60 * 60 * 1000
    return Math.floor(this.range(end, start))
  }
}

const rng = new SeededRNG(42)

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

// Type definitions
const CHAT_LAYOUTS = ["slack", "imessage"] as const
type ChatLayout = typeof CHAT_LAYOUTS[number]

const TASK_STATUSES = ["backlog", "ready", "in_progress", "in_review", "done", "blocked"] as const
type TaskStatus = typeof TASK_STATUSES[number]

const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const
type TaskPriority = typeof TASK_PRIORITIES[number]

const ROLES = ["dev", "dev", "dev", "reviewer", "pm", "research"] as const
type Role = "dev" | "reviewer" | "pm" | "research"

const COMMENT_AUTHOR_TYPES = ["coordinator", "agent", "agent", "human"] as const
type CommentAuthorType = "coordinator" | "agent" | "human"

const COMMENT_TYPES = ["message", "message", "message", "status_change", "request_input", "completion"] as const
type CommentType = "message" | "status_change" | "request_input" | "completion"

const WORK_LOOP_PHASES = ["cleanup", "triage", "notify", "work", "review", "analyze"] as const
type WorkLoopPhase = typeof WORK_LOOP_PHASES[number]

const SESSION_TYPES = ["main", "chat", "agent", "cron"] as const
type SessionType = typeof SESSION_TYPES[number]

const SESSION_STATUSES = ["active", "idle", "completed", "stale"] as const
type SessionStatus = typeof SESSION_STATUSES[number]

const NOTIFICATION_TYPES = ["escalation", "request_input", "completion", "system"] as const
type NotificationType = typeof NOTIFICATION_TYPES[number]

const SEVERITIES = ["info", "warning", "critical"] as const
type Severity = typeof SEVERITIES[number]

const EVENT_TYPES = [
  "task_created", "task_moved", "task_assigned", "task_completed",
  "comment_added", "agent_started", "agent_completed", "chat_created", "message_sent",
] as const
type EventType = typeof EVENT_TYPES[number]

const SIGNAL_KINDS = ["question", "blocker", "alert", "fyi"] as const
type SignalKind = typeof SIGNAL_KINDS[number]

const SIGNAL_SEVERITIES = ["normal", "high", "critical"] as const
type SignalSeverity = typeof SIGNAL_SEVERITIES[number]

const TASK_EVENT_TYPES = ["created", "assigned", "started", "completed", "reviewed", "merged"] as const
type TaskEventType = typeof TASK_EVENT_TYPES[number]

const FEATURE_STATUSES = ["draft", "planned", "in_progress", "completed", "deferred"] as const
type FeatureStatus = typeof FEATURE_STATUSES[number]

const REQUIREMENT_STATUSES = ["draft", "approved", "implemented", "deferred"] as const
type RequirementStatus = typeof REQUIREMENT_STATUSES[number]

const PROMPT_ROLES = ["dev", "reviewer"] as const
type PromptRole = typeof PROMPT_ROLES[number]

const ANALYSIS_OUTCOMES = ["success", "failure", "partial", "abandoned"] as const
type AnalysisOutcome = typeof ANALYSIS_OUTCOMES[number]

const AMENDMENT_STATUSES = ["pending", "applied", "rejected", "deferred"] as const
type AmendmentStatus = typeof AMENDMENT_STATUSES[number]

const PERIODS = ["day", "week", "all_time"] as const
type Period = typeof PERIODS[number]

const AB_STATUSES = ["control", "challenger"] as const
type ABStatus = typeof AB_STATUSES[number]

// Data generators
const PROJECTS = [
  {
    slug: "acme-api",
    name: "Acme API",
    description: "REST API backend for Acme Corp",
    color: "#3b82f6", // blue
    repoUrl: "https://github.com/acme-corp/api",
    workLoopStatus: "running" as const,
  },
  {
    slug: "pixel-ui",
    name: "Pixel UI",
    description: "React component library with accessibility focus",
    color: "#8b5cf6", // purple
    repoUrl: "https://github.com/acme-corp/pixel-ui",
    workLoopStatus: "paused" as const,
  },
  {
    slug: "data-pipeline",
    name: "Data Pipeline",
    description: "ETL data processing infrastructure",
    color: "#10b981", // green
    repoUrl: "https://github.com/acme-corp/data-pipeline",
    workLoopStatus: "running" as const,
  },
  {
    slug: "mobile-app",
    name: "Mobile App",
    description: "React Native mobile application",
    color: "#f97316", // orange
    repoUrl: "https://github.com/acme-corp/mobile-app",
    workLoopStatus: "stopped" as const,
  },
]

const TASK_TITLES: Record<Role, string[]> = {
  dev: [
    "Add rate limiting to /api/users endpoint",
    "Implement JWT refresh token rotation",
    "Fix race condition in concurrent writes",
    "Optimize database query for dashboard",
    "Add Redis caching layer for hot data",
    "Implement webhook retry logic",
    "Add request validation middleware",
    "Fix memory leak in event handler",
    "Implement circuit breaker pattern",
    "Add structured logging with correlation IDs",
    "Create database migration for new schema",
    "Implement soft delete functionality",
    "Add bulk import CSV endpoint",
    "Fix CORS issues for new frontend",
    "Implement feature flag system",
    "Add health check endpoint",
    "Optimize image processing pipeline",
    "Implement rate limiting by IP",
    "Add request/response compression",
    "Fix timezone handling in reports",
    "Implement optimistic locking",
    "Add database connection pooling",
    "Create backup/restore automation",
    "Implement audit logging",
  ],
  reviewer: [
    "Review authentication implementation",
    "Security audit: dependency updates",
    "Code review: payment integration",
    "Performance review: query optimization",
    "Review API contract changes",
    "Security review: input validation",
    "Architecture review: microservices split",
    "Review test coverage for new features",
    "Code review: error handling patterns",
    "Review documentation accuracy",
  ],
  pm: [
    "Define user story acceptance criteria",
    "Create product requirements document",
    "Prioritize Q2 roadmap items",
    "Draft API design guidelines",
    "Plan migration strategy",
    "Define success metrics",
    "Create user flow diagrams",
    "Draft release notes",
  ],
  research: [
    "Evaluate GraphQL vs REST tradeoffs",
    "Research serverless deployment options",
    "Investigate database sharding strategies",
    "Evaluate monitoring solutions",
    "Research authentication providers",
    "Investigate caching strategies",
  ],
}

const COMMENT_CONTENTS = [
  // Agent questions
  "I've started working on this. Should I implement the rate limiting with a sliding window or token bucket approach?",
  "The database schema doesn't have an index on the user_id column. Should I add one before implementing this feature?",
  "I'm seeing some flaky tests in CI. Should I fix those first or proceed with this task?",
  "The API contract specifies 429 status code for rate limits. Should I also include retry-after headers?",
  "Do you want me to implement this as a middleware that applies globally, or should it be opt-in per route?",
  "I noticed the documentation mentions Redis but we also have Memcached available. Which should I use?",
  "The webhook payload structure seems inconsistent with the other endpoints. Should I normalize it?",
  "I'm hitting a circular dependency in the module imports. Should I refactor the shared types into a separate package?",
  "The test coverage for this module is only 45%. Should I add tests as part of this PR?",
  "There's a potential breaking change here for API consumers. Should I version the endpoint?",

  // Human responses
  "Use token bucket - it's more flexible for burst traffic.",
  "Yes, definitely add that index. It'll make the queries much faster.",
  "Let's fix the flaky tests first. I don't want to add more instability.",
  "Yes, include retry-after headers. And maybe a link to our rate limit docs.",
  "Make it opt-in per route for now. We can enable globally once we've tested it.",
  "Use Redis - we have better monitoring and alerting set up for it.",
  "Good catch! Yes, please normalize it to match the standard format.",
  "Good idea - move the shared types to the common package.",
  "Yes, please get coverage to at least 80% before marking done.",
  "No need to version yet. The consumers are internal teams.",

  // Status updates
  "Implementation is complete. All tests passing.",
  "Found a bug in the edge case handling. Working on a fix.",
  "Deployed to staging. Ready for QA.",
  "Merged to main. Monitoring for any issues.",
  "Reverted - found a regression in production.",
  "Updated based on review feedback. PTAL.",

  // Coordinator messages
  "This task has been assigned to @agent-dev-1",
  "Moving to in_review. PR #123 is ready for review.",
  "Task completed successfully. Closing.",
  "Escalating to human - blocker encountered.",
]

const CHAT_MESSAGES = [
  "Hey, I'm working on the rate limiting feature. Quick question - do we want to apply limits per API key or per user account?",
  "Per API key is better - some users have multiple accounts but share the same integration.",
  "Makes sense. Should I also add a global rate limit as a safety net?",
  "Yes, definitely. Maybe 10k requests per minute globally?",
  "I'll set it to 10k/min global, 1k/min per API key. Does that sound reasonable?",
  "Perfect. And make sure we have good error messages when limits are hit.",
  "Will do. I'm thinking: 'Rate limit exceeded. Retry after 30 seconds.'",
  "Add a link to the rate limit docs in the error response too.",
  "Good idea. I'll include a 'documentation_url' field in the error response.",
  "How's the implementation going? Any blockers?",
  "Going well. Just wrestling with some edge cases around the token bucket refill logic.",
  "What kind of edge cases?",
  "When the bucket is empty and we get a burst of requests, the refill calculation needs to be precise.",
  "Ah, the classic race condition in token bucket algorithms. Have you looked at how Stripe handles this?",
  "I haven't. Let me check their implementation for reference.",
  "Their approach is solid - they use a Lua script in Redis for atomic operations.",
  "That's a great pattern. I'll implement something similar.",
]

const MODELS = [
  { id: "claude-sonnet-4", name: "Claude Sonnet 4", inputPrice: 3, outputPrice: 15 },
  { id: "claude-opus-4", name: "Claude Opus 4", inputPrice: 15, outputPrice: 75 },
  { id: "gpt-4o", name: "GPT-4o", inputPrice: 2.5, outputPrice: 10 },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", inputPrice: 0.15, outputPrice: 0.6 },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", inputPrice: 1.25, outputPrice: 5 },
]

const PHASES = [
  { name: "Foundation", goal: "Core infrastructure and authentication" },
  { name: "API Layer", goal: "REST API endpoints and validation" },
  { name: "Frontend", goal: "React components and user interface" },
  { name: "Integration", goal: "Third-party integrations and webhooks" },
]

async function main() {
  console.log("🌱 OpenClutch Demo Seed Script")
  console.log(`   Convex URL: ${convexUrl}`)
  console.log(`   Clean mode: ${shouldClean}`)
  console.log()

  const client = new ConvexHttpClient(convexUrl)

  // Clean existing data if requested
  if (shouldClean) {
    console.log("🧹 Clearing existing data...")
    await client.mutation(api.seed.clearAll, {})
    console.log("   ✓ Data cleared")
    console.log()
  }

  console.log("📦 Creating demo data...")

  // Track created IDs for relationships
  const projectIds: string[] = []
  const taskIds: string[] = []
  const taskIdsByProject: Record<string, string[]> = {}
  const chatIds: string[] = []

  // 1. Create Projects
  console.log("   Creating projects...")
  for (let i = 0; i < PROJECTS.length; i++) {
    const p = PROJECTS[i]
    const projectId = generateUUID(1000 + i)
    projectIds.push(projectId)
    taskIdsByProject[projectId] = []

    const now = Date.now()
    const chatLayout: ChatLayout = rng.pick(CHAT_LAYOUTS)
    await client.mutation(api.seed.insertProject, {
      id: projectId,
      slug: p.slug,
      name: p.name,
      description: p.description,
      color: p.color,
      repo_url: p.repoUrl,
      context_path: `/home/demo/${p.slug}`,
      local_path: `/home/demo/${p.slug}`,
      github_repo: p.slug,
      chat_layout: chatLayout,
      work_loop_enabled: p.workLoopStatus !== "stopped",
      created_at: rng.dateInRange(14, 7),
      updated_at: now,
    })

    // Create work loop state for each project
    const workLoopPhase: WorkLoopPhase = rng.pick(WORK_LOOP_PHASES)
    await client.mutation(api.seed.insertWorkLoopState, {
      id: generateUUID(2000 + i),
      project_id: projectId,
      status: p.workLoopStatus,
      current_phase: workLoopPhase,
      current_cycle: rng.range(10, 500),
      active_agents: p.workLoopStatus === "running" ? rng.range(1, 5) : 0,
      max_agents: 5,
      last_cycle_at: now - rng.range(1000, 300000),
      updated_at: now,
    })
  }
  console.log(`      ✓ Created ${PROJECTS.length} projects`)

  // 2. Create Tasks (~40-50 across projects)
  console.log("   Creating tasks...")
  const totalTasks = rng.range(40, 50)

  for (let i = 0; i < totalTasks; i++) {
    const projectId = rng.pick(projectIds)
    const role: Role = rng.pick(ROLES)
    const status: TaskStatus = rng.pick(TASK_STATUSES)
    const title: string = rng.pick(TASK_TITLES[role])
    const taskId = generateUUID(3000 + i)

    taskIds.push(taskId)
    taskIdsByProject[projectId].push(taskId)

    const hasBranch = status !== "backlog" && status !== "ready" && rng.boolean(0.7)
    const hasPR = (status === "in_review" || status === "done") && rng.boolean(0.8)
    const isEscalated = status === "blocked" || rng.boolean(0.1)
    const rejectionCount = rng.boolean(0.2) ? rng.range(1, 3) : 0
    const priority: TaskPriority = rng.pick(TASK_PRIORITIES)

    await client.mutation(api.seed.insertTask, {
      id: taskId,
      project_id: projectId,
      title,
      description: `Implement ${title.toLowerCase()}. This is part of the ${PROJECTS.find(p => taskIdsByProject[p.slug === projectId ? projectId : ""] === taskIdsByProject[projectId])?.name || "project"} roadmap.`,
      status,
      priority,
      role: role as string,
      assignee: rng.boolean(0.6) ? rng.pick(["agent-dev-1", "agent-dev-2", "agent-reviewer-1", "human-1"]) : undefined,
      requires_human_review: rng.boolean(0.3),
      tags: JSON.stringify(rng.pickMany(["frontend", "backend", "api", "database", "security", "performance", "testing", "docs"], rng.range(1, 3))),
      session_id: rng.boolean(0.4) ? `agent:main:demo:${taskId.slice(0, 8)}` : undefined,
      dispatch_status: status === "in_progress" ? rng.pick(["active", "spawning", "pending"]) : undefined,
      dispatch_requested_at: status === "in_progress" ? Date.now() - rng.range(60000, 3600000) : undefined,
      dispatch_requested_by: rng.pick(["coordinator", "human-1"]),
      position: i,
      created_at: rng.dateInRange(10, 0),
      updated_at: Date.now() - rng.range(0, 86400000),
      completed_at: status === "done" ? Date.now() - rng.range(0, 172800000) : undefined,
      branch: hasBranch ? `fix/${taskId.slice(0, 8)}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}` : undefined,
      pr_number: hasPR ? rng.range(100, 500) : undefined,
      reviewer_rejection_count: rejectionCount,
      escalated: isEscalated,
      escalated_at: isEscalated ? Date.now() - rng.range(3600000, 86400000) : undefined,
    })
  }
  console.log(`      ✓ Created ${totalTasks} tasks`)

  // 3. Create Task Dependencies
  console.log("   Creating task dependencies...")
  const dependencyCount = rng.range(10, 15)
  for (let i = 0; i < dependencyCount; i++) {
    const task = rng.pick(taskIds)
    const dependsOn = rng.pick(taskIds.filter(t => t !== task))
    await client.mutation(api.seed.insertTaskDependency, {
      id: generateUUID(4000 + i),
      task_id: task,
      depends_on_id: dependsOn,
      created_at: rng.dateInRange(7, 0),
    })
  }
  console.log(`      ✓ Created ${dependencyCount} dependencies`)

  // 4. Create Comments (~60-80)
  console.log("   Creating comments...")
  const totalComments = rng.range(60, 80)

  for (let i = 0; i < totalComments; i++) {
    const taskId = rng.pick(taskIds)
    const authorType: CommentAuthorType = rng.pick(COMMENT_AUTHOR_TYPES)
    const type: CommentType = rng.pick(COMMENT_TYPES)

    let content = rng.pick(COMMENT_CONTENTS)
    if (type === "status_change") {
      content = `Status changed from ${rng.pick(["backlog", "ready", "in_progress"])} to ${rng.pick(["in_progress", "in_review", "done"])}`
    } else if (type === "completion") {
      content = `Task completed. ${rng.pick(["All tests passing.", "Deployed to production.", "Ready for review."])}`
    }

    const author: string = authorType === "human" ? rng.pick(["alice", "bob", "carol"]) : rng.pick(["coordinator", "agent-dev-1", "agent-reviewer-1"])

    await client.mutation(api.seed.insertComment, {
      id: generateUUID(5000 + i),
      task_id: taskId,
      author,
      author_type: authorType,
      content,
      type,
      responded_at: type === "request_input" && rng.boolean(0.7) ? Date.now() - rng.range(0, 3600000) : undefined,
      created_at: rng.dateInRange(7, 0),
    })
  }
  console.log(`      ✓ Created ${totalComments} comments`)

  // 5. Create Chats (~4-6 threads)
  console.log("   Creating chats...")
  const totalChats = rng.range(4, 6)
  for (let i = 0; i < totalChats; i++) {
    const projectId = rng.pick(projectIds)
    const chatId = generateUUID(6000 + i)
    chatIds.push(chatId)

    await client.mutation(api.seed.insertChat, {
      id: chatId,
      project_id: projectId,
      title: rng.pick(["API Design Discussion", "Bug Triage", "Sprint Planning", "Architecture Review", "Deployment Coordination"]),
      participants: JSON.stringify(rng.pickMany(["alice", "bob", "carol", "agent-dev-1", "agent-reviewer-1"], rng.range(2, 4))),
      session_key: rng.boolean(0.5) ? `chat:${projectId}:${Date.now()}` : undefined,
      created_at: rng.dateInRange(7, 3),
      updated_at: Date.now() - rng.range(0, 86400000),
    })

    // Create messages for each chat
    const messageCount = rng.range(8, 15)
    for (let j = 0; j < messageCount; j++) {
      const content = CHAT_MESSAGES[j % CHAT_MESSAGES.length]
      const author: string = j % 2 === 0 ? rng.pick(["agent-dev-1", "agent-reviewer-1"]) : rng.pick(["alice", "bob"])

      await client.mutation(api.seed.insertChatMessage, {
        id: generateUUID(7000 + i * 100 + j),
        chat_id: chatId,
        author,
        content,
        run_id: author.startsWith("agent") ? `run-${Date.now()}-${j}` : undefined,
        session_key: rng.boolean(0.3) ? `session-${Date.now()}-${j}` : undefined,
        is_automated: author.startsWith("agent"),
        created_at: Date.now() - (messageCount - j) * rng.range(300000, 900000),
      })
    }
  }
  console.log(`      ✓ Created ${totalChats} chats with messages`)

  // 6. Create Work Loop Runs (~100 entries)
  console.log("   Creating work loop runs...")
  const WORK_LOOP_ACTIONS = [
    "Scanning for stale tasks",
    "Checking blocked tasks",
    "Notifying task owners",
    "Spawning agent for task",
    "Reviewing PR",
    "Analyzing task completion",
    "Updating task status",
    "Cleaning up old sessions",
  ]

  for (let i = 0; i < 100; i++) {
    const projectId = rng.pick(projectIds)
    const phase: WorkLoopPhase = rng.pick(WORK_LOOP_PHASES)
    await client.mutation(api.seed.insertWorkLoopRun, {
      id: generateUUID(8000 + i),
      project_id: projectId,
      cycle: rng.range(1, 500),
      phase,
      action: rng.pick(WORK_LOOP_ACTIONS),
      task_id: rng.boolean(0.6) ? rng.pick(taskIds) : undefined,
      session_key: rng.boolean(0.3) ? `session-${Date.now()}-${i}` : undefined,
      details: rng.boolean(0.5) ? JSON.stringify({ duration: rng.range(1000, 30000) }) : undefined,
      duration_ms: rng.range(100, 30000),
      created_at: Date.now() - rng.range(0, 3 * 24 * 60 * 60 * 1000), // Last 3 days
    })
  }
  console.log("      ✓ Created 100 work loop runs")

  // 7. Create Sessions (~15-20)
  console.log("   Creating sessions...")
  const totalSessions = rng.range(15, 20)

  for (let i = 0; i < totalSessions; i++) {
    const type: SessionType = rng.pick(SESSION_TYPES)
    const status: SessionStatus = rng.pick(SESSION_STATUSES)
    const model = rng.pick(MODELS)
    const tokensInput = rng.range(1000, 50000)
    const tokensOutput = rng.range(500, 20000)
    const costInput = (tokensInput / 1000000) * model.inputPrice
    const costOutput = (tokensOutput / 1000000) * model.outputPrice

    await client.mutation(api.seed.insertSession, {
      id: generateUUID(9000 + i),
      session_key: `${type}:demo:${Date.now()}-${i}`,
      session_id: generateUUID(9500 + i),
      session_type: type,
      model: model.id,
      provider: rng.pick(["anthropic", "openai", "google"]),
      status,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      tokens_cache_read: rng.boolean(0.3) ? rng.range(100, 5000) : 0,
      tokens_cache_write: rng.boolean(0.1) ? rng.range(100, 2000) : 0,
      tokens_total: tokensInput + tokensOutput,
      cost_input: costInput,
      cost_output: costOutput,
      cost_total: costInput + costOutput,
      last_active_at: Date.now() - rng.range(0, 86400000),
      output_preview: rng.boolean(0.5) ? "Implementation complete. All tests passing..." : undefined,
      stop_reason: status === "completed" ? rng.pick(["end_turn", "max_tokens", "stop"]) : undefined,
      task_id: rng.boolean(0.6) ? rng.pick(taskIds) : undefined,
      project_slug: rng.pick(PROJECTS).slug,
      file_path: `/tmp/sessions/${type}-${Date.now()}.json`,
      created_at: rng.dateInRange(7, 0),
      updated_at: Date.now() - rng.range(0, 3600000),
      completed_at: status === "completed" ? Date.now() - rng.range(0, 86400000) : undefined,
    })
  }
  console.log(`      ✓ Created ${totalSessions} sessions`)

  // 8. Create Roadmap Data
  console.log("   Creating roadmap data...")
  for (let pIdx = 0; pIdx < projectIds.length; pIdx++) {
    const projectId = projectIds[pIdx]

    // Create phases
    for (let i = 0; i < PHASES.length; i++) {
      const phase = PHASES[i]
      const phaseId = generateUUID(10000 + pIdx * 100 + i)
      const phaseStatus: FeatureStatus = rng.pick(FEATURE_STATUSES)

      await client.mutation(api.seed.insertRoadmapPhase, {
        id: phaseId,
        project_id: projectId,
        number: i + 1,
        name: phase.name,
        goal: phase.goal,
        description: `Phase ${i + 1} of the project focusing on ${phase.goal.toLowerCase()}.`,
        status: phaseStatus,
        depends_on: i > 0 ? JSON.stringify([generateUUID(10000 + pIdx * 100 + i - 1)]) : undefined,
        success_criteria: JSON.stringify([
          "All tests passing",
          "Documentation complete",
          "Performance benchmarks met",
        ]),
        position: i,
        inserted: false,
        created_at: rng.dateInRange(14, 7),
        updated_at: Date.now() - rng.range(0, 86400000),
      })

      // Create features for each phase
      const featureCount = rng.range(2, 4)
      for (let j = 0; j < featureCount; j++) {
        const featureId = generateUUID(11000 + pIdx * 1000 + i * 100 + j)
        const featureStatus: FeatureStatus = rng.pick(FEATURE_STATUSES)

        await client.mutation(api.seed.insertFeature, {
          id: featureId,
          project_id: projectId,
          title: rng.pick([
            "User Authentication",
            "Dashboard Widgets",
            "API Rate Limiting",
            "Data Export",
            "Email Notifications",
            "Mobile Responsiveness",
            "Search Functionality",
            "Role-Based Access Control",
          ]),
          description: "Feature description with acceptance criteria and technical notes.",
          status: featureStatus,
          priority: rng.pick(TASK_PRIORITIES),
          position: j,
          created_at: rng.dateInRange(10, 0),
          updated_at: Date.now() - rng.range(0, 86400000),
        })

        // Create requirements for each feature
        const reqCount = rng.range(2, 5)
        for (let k = 0; k < reqCount; k++) {
          const reqStatus: RequirementStatus = rng.pick(REQUIREMENT_STATUSES)
          const reqPriority: TaskPriority = rng.pick(TASK_PRIORITIES)
          await client.mutation(api.seed.insertRequirement, {
            id: generateUUID(12000 + pIdx * 10000 + i * 1000 + j * 100 + k),
            project_id: projectId,
            feature_id: featureId,
            title: rng.pick([
              "Implement OAuth 2.0 flow",
              "Add password validation",
              "Create session management",
              "Add audit logging",
              "Implement rate limiting",
              "Add error handling",
            ]),
            description: "Technical requirement with implementation details.",
            category: rng.pick(["AUTH", "API", "UI", "DATA", "PERF"]),
            status: reqStatus,
            priority: reqPriority,
            position: k,
            created_at: rng.dateInRange(10, 0),
            updated_at: Date.now() - rng.range(0, 86400000),
          })
        }
      }
    }
  }
  console.log("      ✓ Created roadmap data with phases, features, and requirements")

  // 9. Create Prompt Lab Data
  console.log("   Creating prompt lab data...")

  for (const role of PROMPT_ROLES) {
    // Create prompt versions
    for (let i = 0; i < rng.range(2, 4); i++) {
      const promptId = generateUUID(13000 + (role === "dev" ? 0 : 100) + i)
      const isABTest = i > 0 && rng.boolean(0.5)
      const abStatus: ABStatus | undefined = isABTest ? rng.pick(AB_STATUSES) : undefined

      await client.mutation(api.seed.insertPromptVersion, {
        id: promptId,
        role,
        model: rng.pick(MODELS).id,
        version: i + 1,
        content: `You are an expert ${role} assistant. Your task is to ${role === "dev" ? "implement features efficiently with clean, tested code" : "review code for quality, security, and maintainability"}.

Guidelines:
- Follow project conventions
- ${role === "dev" ? "Write comprehensive tests" : "Check for edge cases and error handling"}
- ${role === "dev" ? "Optimize for performance" : "Verify security best practices"}
- Document significant decisions`,
        change_summary: i === 0 ? "Initial prompt" : rng.pick([
          "Added more specific guidelines",
          "Improved error handling instructions",
          "Updated based on recent feedback",
          "Added performance optimization hints",
        ]),
        parent_version_id: i > 0 ? generateUUID(13000 + (role === "dev" ? 0 : 100) + i - 1) : undefined,
        created_by: rng.pick(["alice", "bob"]),
        active: i === 0,
        created_at: rng.dateInRange(14, 0),
        ab_status: isABTest ? abStatus : "none",
        ab_split_percent: isABTest ? rng.range(30, 50) : undefined,
        ab_started_at: isABTest ? Date.now() - rng.range(86400000, 7 * 86400000) : undefined,
        ab_min_tasks: isABTest ? rng.range(10, 50) : undefined,
      })

      // Create task analyses for this prompt
      const analysisCount = rng.range(3, 6)
      for (let j = 0; j < analysisCount; j++) {
        const outcome: AnalysisOutcome = rng.pick(ANALYSIS_OUTCOMES)
        const amendmentStatus: AmendmentStatus | undefined = rng.boolean(0.3) ? rng.pick(AMENDMENT_STATUSES) : undefined
        await client.mutation(api.seed.insertTaskAnalysis, {
          id: generateUUID(14000 + (role === "dev" ? 0 : 1000) + i * 100 + j),
          task_id: rng.pick(taskIds),
          session_key: `analysis-${Date.now()}-${j}`,
          role,
          model: rng.pick(MODELS).id,
          prompt_version_id: promptId,
          outcome,
          token_count: rng.range(1000, 30000),
          duration_ms: rng.range(5000, 120000),
          failure_modes: rng.boolean(0.2) ? JSON.stringify(["timeout", "context_length"]) : undefined,
          amendments: rng.boolean(0.3) ? "Consider adding input validation" : undefined,
          amendment_status: amendmentStatus,
          analysis_summary: rng.pick([
            "Task completed successfully with all requirements met.",
            "Partial implementation - some edge cases need handling.",
            "Good progress but requires follow-up on error handling.",
          ]),
          confidence: rng.range(60, 95) / 100,
          analyzed_at: Date.now() - rng.range(0, 7 * 86400000),
        })
      }
    }

    // Create prompt metrics
    const period: Period = rng.pick(PERIODS)
    await client.mutation(api.seed.insertPromptMetric, {
      id: generateUUID(15000 + (role === "dev" ? 0 : 100)),
      role,
      model: rng.pick(MODELS).id,
      prompt_version_id: generateUUID(13000 + (role === "dev" ? 0 : 100)),
      period,
      period_start: Date.now() - rng.range(0, 7 * 86400000),
      total_tasks: rng.range(20, 100),
      success_count: rng.range(10, 70),
      failure_count: rng.range(0, 10),
      partial_count: rng.range(5, 20),
      abandoned_count: rng.range(0, 5),
      avg_tokens: rng.range(5000, 15000),
      avg_duration_ms: rng.range(30000, 120000),
      bounce_count: rng.range(0, 10),
      failure_modes: JSON.stringify({ timeout: rng.range(0, 5), error: rng.range(0, 3) }),
      computed_at: Date.now(),
    })
  }
  console.log("      ✓ Created prompt lab data")

  // 10. Create Notifications
  console.log("   Creating notifications...")
  const notificationCount = rng.range(15, 25)

  for (let i = 0; i < notificationCount; i++) {
    const type: NotificationType = rng.pick(NOTIFICATION_TYPES)
    const severity: Severity = type === "escalation" ? "critical" : rng.pick(SEVERITIES)

    await client.mutation(api.seed.insertNotification, {
      id: generateUUID(16000 + i),
      task_id: rng.boolean(0.7) ? rng.pick(taskIds) : undefined,
      project_id: rng.boolean(0.5) ? rng.pick(projectIds) : undefined,
      type,
      severity,
      title: rng.pick([
        "Task requires attention",
        "Agent needs input",
        "Task completed",
        "System alert",
        "Review required",
      ]),
      message: rng.pick([
        "A task has been escalated and requires human review.",
        "An agent is requesting clarification on requirements.",
        "Task has been completed successfully.",
        "System performance degradation detected.",
      ]),
      agent: rng.boolean(0.6) ? rng.pick(["agent-dev-1", "agent-reviewer-1"]) : undefined,
      read: rng.boolean(0.4),
      created_at: Date.now() - rng.range(0, 7 * 86400000),
    })
  }
  console.log(`      ✓ Created ${notificationCount} notifications`)

  // 11. Create Events
  console.log("   Creating events...")
  const eventCount = rng.range(30, 50)

  for (let i = 0; i < eventCount; i++) {
    const eventType: EventType = rng.pick(EVENT_TYPES)
    await client.mutation(api.seed.insertEvent, {
      id: generateUUID(17000 + i),
      project_id: rng.boolean(0.8) ? rng.pick(projectIds) : undefined,
      task_id: rng.boolean(0.7) ? rng.pick(taskIds) : undefined,
      type: eventType,
      actor: rng.pick(["alice", "bob", "carol", "agent-dev-1", "agent-reviewer-1", "coordinator"]),
      data: JSON.stringify({ source: "demo-seed", index: i }),
      created_at: Date.now() - rng.range(0, 7 * 86400000),
    })
  }
  console.log(`      ✓ Created ${eventCount} events`)

  // 12. Create Signals
  console.log("   Creating signals...")
  const signalCount = rng.range(8, 15)

  for (let i = 0; i < signalCount; i++) {
    const kind: SignalKind = rng.pick(SIGNAL_KINDS)
    const blocking = kind === "blocker" || rng.boolean(0.2)

    await client.mutation(api.seed.insertSignal, {
      id: generateUUID(18000 + i),
      task_id: rng.pick(taskIds),
      session_key: `session-${Date.now()}-${i}`,
      agent_id: rng.pick(["agent-dev-1", "agent-reviewer-1", "agent-pm-1"]),
      kind,
      severity: blocking ? "critical" : rng.pick(SIGNAL_SEVERITIES),
      message: rng.pick([
        "Need clarification on API endpoint behavior",
        "Database connection pool exhausted",
        "Tests failing in CI environment",
        "Unclear requirement in user story",
        "Third-party API rate limit hit",
        "Need access to production logs",
      ]),
      blocking,
      responded_at: rng.boolean(0.5) ? Date.now() - rng.range(0, 3600000) : undefined,
      response: rng.boolean(0.5) ? "Acknowledged. Will investigate." : undefined,
      created_at: Date.now() - rng.range(0, 3 * 86400000),
    })
  }
  console.log(`      ✓ Created ${signalCount} signals`)

  // 13. Create Model Pricing
  console.log("   Creating model pricing...")
  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i]
    await client.mutation(api.seed.insertModelPricing, {
      id: generateUUID(19000 + i),
      model: model.id,
      input_per_1m: model.inputPrice,
      output_per_1m: model.outputPrice,
      updated_at: Date.now() - rng.range(0, 30 * 86400000),
    })
  }
  console.log(`      ✓ Created ${MODELS.length} model pricing entries`)

  // 14. Create Task Events
  console.log("   Creating task events...")
  const taskEventCount = rng.range(40, 60)

  for (let i = 0; i < taskEventCount; i++) {
    const tokensInput = rng.range(100, 10000)
    const tokensOutput = rng.range(50, 5000)
    const model = rng.pick(MODELS)
    const costInput = (tokensInput / 1000000) * model.inputPrice
    const costOutput = (tokensOutput / 1000000) * model.outputPrice
    const eventType: TaskEventType = rng.pick(TASK_EVENT_TYPES)

    await client.mutation(api.seed.insertTaskEvent, {
      id: generateUUID(20000 + i),
      task_id: rng.pick(taskIds),
      project_id: rng.pick(projectIds),
      event_type: eventType,
      timestamp: Date.now() - rng.range(0, 7 * 86400000),
      actor: rng.pick(["alice", "bob", "agent-dev-1", "agent-reviewer-1"]),
      data: JSON.stringify({ automated: rng.boolean(0.5), source: "demo" }),
      cost_input: costInput,
      cost_output: costOutput,
      cost_total: costInput + costOutput,
    })
  }
  console.log(`      ✓ Created ${taskEventCount} task events`)

  console.log()
  console.log("✅ Demo data seeding complete!")
  console.log()
  console.log("Summary:")
  console.log(`   • ${PROJECTS.length} projects with work loop states`)
  console.log(`   • ${totalTasks} tasks with dependencies and comments`)
  console.log(`   • ${totalChats} chat threads with messages`)
  console.log(`   • 100 work loop runs over 3 days`)
  console.log(`   • ${totalSessions} sessions with cost tracking`)
  console.log(`   • Roadmap with phases, features, and requirements`)
  console.log(`   • Prompt lab with versions, analyses, and metrics`)
  console.log(`   • ${notificationCount} notifications`)
  console.log(`   • ${eventCount} audit events`)
  console.log(`   • ${signalCount} signals from agents`)
  console.log(`   • ${MODELS.length} model pricing entries`)
  console.log(`   • ${taskEventCount} task events with cost data`)
  console.log()
  console.log("You can now view the demo at: http://localhost:3002")
}

main().catch((error) => {
  console.error("❌ Seed failed:", error)
  process.exit(1)
})
