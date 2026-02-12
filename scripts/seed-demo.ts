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
import { execSync } from "child_process"

// Parse command line arguments
const args = process.argv.slice(2)
const shouldClean = args.includes("--clean")
const urlIndex = args.indexOf("--url")
const convexUrl = urlIndex >= 0 ? args[urlIndex + 1] : process.env.CONVEX_URL || "http://localhost:3230"

/**
 * Run safety checks before destructive operations
 */
function runSafetyChecks(): boolean {
  // Skip if explicitly bypassed
  if (process.env.DEMO_UNSAFE_BYPASS === "true") {
    console.warn("⚠️  SAFETY CHECKS BYPASSED")
    return true
  }

  // Only run safety checks when cleaning (destructive operation)
  if (!shouldClean) {
    return true
  }

  console.log("🔒 Running safety checks before clearing data...")

  try {
    // Check if we're targeting the production URL
    if (convexUrl.includes(":3210")) {
      console.error("❌ ERROR: Attempting to clean production Convex instance!")
      console.error("   URL contains production port 3210")
      console.error("   Use --url http://localhost:3230 for demo instance")
      return false
    }

    // Verify demo port is being used
    if (!convexUrl.includes(":3230")) {
      console.warn("⚠️  WARNING: URL does not contain demo port 3230")
      console.warn(`   Current URL: ${convexUrl}`)
      console.warn("   Make sure you're targeting the demo instance!")
    }

    // Run full safety check script if available
    try {
      execSync("tsx scripts/demo-safety-check.ts", {
        stdio: "inherit",
      })
    } catch {
      console.error("❌ Safety checks failed. Aborting.")
      console.log("")
      console.log("To bypass safety checks (DANGEROUS):")
      console.log("  DEMO_UNSAFE_BYPASS=true pnpm demo:seed --clean")
      return false
    }

    return true
  } catch (error) {
    console.error("❌ Safety check error:", error)
    return false
  }
}

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

// Track all used UUIDs to detect collisions
const usedUUIDs = new Map<string, string>()

// Helper to generate UUID v4 (deterministic based on seed)
function generateUUID(seed: number, context?: string): string {
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

  // Check for collisions
  if (usedUUIDs.has(uuid)) {
    const existingContext = usedUUIDs.get(uuid)
    console.warn(`⚠️  UUID collision detected: ${uuid}`)
    console.warn(`   Context 1: ${existingContext}`)
    console.warn(`   Context 2: ${context || `seed ${seed}`}`)
  } else {
    usedUUIDs.set(uuid, context || `seed ${seed}`)
  }

  return uuid
}

// Seed range constants - ensure no overlaps between entity types
const SEED_RANGES = {
  projects: { start: 1000, count: 10 },           // 1000-1009
  workLoopStates: { start: 2000, count: 10 },     // 2000-2009
  tasks: { start: 3000, count: 100 },             // 3000-3099
  dependencies: { start: 4000, count: 50 },       // 4000-4049
  comments: { start: 5000, count: 200 },          // 5000-5199
  chats: { start: 6000, count: 20 },              // 6000-6019
  chatMessages: { start: 7000, count: 2000 },     // 7000-8999 (20 chats * 100 max messages)
  workLoopRuns: { start: 10000, count: 200 },     // 10000-10199
  sessions: { start: 11000, count: 200 },         // 11000-11199 (100 sessions + 100 session_ids)
  phases: { start: 12000, count: 50 },            // 12000-12049
  features: { start: 13000, count: 500 },         // 13000-13499
  requirements: { start: 20000, count: 5000 },    // 20000-24999
  promptVersions: { start: 30000, count: 100 },   // 30000-30099 (7 roles * 10 versions)
  taskAnalyses: { start: 40000, count: 10000 },   // 40000-49999
  promptMetrics: { start: 50000, count: 100 },    // 50000-50099
  notifications: { start: 60000, count: 50 },     // 60000-60049
  events: { start: 70000, count: 100 },           // 70000-70099
  signals: { start: 80000, count: 50 },           // 80000-80049
  modelPricing: { start: 90000, count: 10 },      // 90000-90009
  taskEvents: { start: 100000, count: 100 },      // 100000-100099
} as const

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

const PROMPT_ROLES = ["dev", "pm", "qa", "researcher", "reviewer", "pe", "analyzer"] as const
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

// Realistic agent conversation templates for different scenarios
interface ChatMessage {
  author: string
  content: string
}

const CHAT_CONVERSATIONS: ChatMessage[][] = [
  // Conversation 1: Rate limiting implementation
  [
    { author: "agent-dev-1", content: "🤔 **Thinking:** Looking at the rate limiting requirements. I need to decide between token bucket vs sliding window. Token bucket allows bursts which is better for our API use case.\n\nPlanning to implement:\n1. Redis-based token bucket\n2. Per-API-key limits\n3. Global safety net\n4. Proper error responses with Retry-After headers" },
    { author: "alice", content: "Use token bucket - it's more flexible for burst traffic. Also make sure we have good observability on rate limit hits." },
    { author: "agent-dev-1", content: "💻 **Working on implementation...**\n\n```typescript\n// Token bucket implementation\nclass TokenBucket {\n  constructor(\n    private key: string,\n    private capacity: number,\n    private refillRate: number\n  ) {}\n\n  async consume(tokens: number = 1): Promise<boolean> {\n    const lua = \`\n      local bucket = redis.call('hmget', KEYS[1], 'tokens', 'last_refill')\n      local tokens = tonumber(bucket[1]) or capacity\n      local last_refill = tonumber(bucket[2]) or now\n      // ... refill logic\n    \`;\n    return redis.eval(lua, 1, this.key);\n  }\n}\n```\n\nDoes this approach look right? Using Lua for atomic operations." },
    { author: "bob", content: "The Lua script approach is solid. That's how Stripe does it. A couple suggestions:\n\n1. Add jitter to the refill calculation to avoid thundering herd\n2. Include current limit info in response headers (X-RateLimit-Limit, X-RateLimit-Remaining)\n3. Consider a grace period for soft limits" },
    { author: "agent-dev-1", content: "✅ **Status Update: Implementation complete**\n\nChanges made:\n- Token bucket with Redis Lua scripts\n- Per-API-key: 1,000 req/min\n- Global safety: 10,000 req/min\n- Response headers: Retry-After, X-RateLimit-*\n- Metrics: rate_limit_hits_total counter\n\n**Tests added:**\n- Unit tests for bucket math\n- Integration tests with Redis\n- Load test: 10k concurrent requests\n\nPR coming up shortly." },
    { author: "alice", content: "Great work! Can you also update the API documentation with examples of the error responses?" },
    { author: "agent-dev-1", content: "📋 **PR Created: #247**\n\nUpdated:\n- `/docs/api/rate-limiting.md` with examples\n- Added 429 response schema to OpenAPI spec\n- Error response now includes:\n  ```json\n  {\n    \"error\": \"rate_limit_exceeded\",\n    \"message\": \"API rate limit exceeded\",\n    \"retry_after\": 30,\n    \"limit\": 1000,\n    \"reset_at\": \"2025-02-11T22:45:00Z\"\n  }\n  ```\n\nReady for review!" },
  ],
  // Conversation 2: Bug fix investigation
  [
    { author: "bob", content: "Seeing intermittent 500s in production on the `/api/v1/users` endpoint. Error rate is about 0.5% but spiking during peak hours. Can you investigate?" },
    { author: "agent-dev-2", content: "🕵️ **Investigating...**\n\nLooking at logs from the last 4 hours:\n- 500s correlate with database connection pool exhaustion\n- Error: `error: sorry, too many clients already`\n- Peak traffic: ~2,500 req/s\n\nCurrent pool size: 20 connections\nRecommended: 50-100 for this load\n\nAlso seeing some slow queries (avg 450ms) that might be holding connections too long." },
    { author: "alice", content: "Good catch. Let's bump the pool size and also add connection timeout handling. Can you also check for connection leaks?" },
    { author: "agent-dev-2", content: "💻 **Fix implemented**\n\n```typescript\n// database.ts\nconst pool = new Pool({\n  max: 100,                    // Increased from 20\n  idleTimeoutMillis: 30000,    // Close idle connections\n  connectionTimeoutMillis: 5000, // Fail fast if no connection\n  statement_timeout: 10000,     // Query timeout\n});\n\n// Added connection leak detection\npool.on('connect', (client) => {\n  client.query('SET application_name = \"acme-api\"');\n});\n```\n\nAlso found the slow query culprit:\n```sql\n-- Before: 450ms\nSELECT * FROM users WHERE email LIKE '%@gmail.com%';\n\n-- After: 12ms (added trigram index)\nCREATE INDEX idx_users_email_trgm ON users USING gin(email gin_trgm_ops);\n```" },
    { author: "bob", content: "Excellent. The trigram index is a nice touch. Can you deploy this to staging first so we can load test?" },
    { author: "agent-dev-2", content: "🚀 **Deployed to staging**\n\nLoad test results (10k concurrent users, 5 min):\n- P50 latency: 23ms (was 145ms)\n- P99 latency: 89ms (was 1,200ms)\n- Error rate: 0% (was 0.5%)\n- DB connections peaked at 67/100\n\n**Monitoring dashboard:** https://grafana.acme.io/d/api-perf\n\nReady for production deploy." },
    { author: "alice", content: "Ship it! 🚢" },
    { author: "agent-dev-2", content: "✅ **Production deploy complete**\n\n- Deployed at 14:32 UTC\n- Rolling restart, zero downtime\n- Error rate dropped to 0.001%\n- Alert configured for connection pool > 80%\n\nClosing this issue." },
  ],
  // Conversation 3: Feature implementation with code review
  [
    { author: "agent-reviewer-1", content: "👀 **Code Review: PR #251**\n\nOverall looks good, but a few concerns:\n\n1. **Security**: The `eval()` usage in `utils.ts:47` is dangerous. Use JSON.parse instead.\n2. **Performance**: The nested loop in `processData()` is O(n²). Can we optimize?\n3. **Testing**: Missing edge case tests for empty arrays\n\n```typescript\n// Line 47 - problematic\nconst data = eval(req.body.json);  // 🚫 Security risk\n\n// Should be:\nconst data = JSON.parse(req.body.json);  // ✅ Safe\n```" },
    { author: "agent-dev-1", content: "🤔 **Thinking:** Good catches. The eval() was leftover from debugging - my bad. For the O(n²) loop, I can use a Map to get O(n). Let me fix both." },
    { author: "agent-dev-1", content: "💻 **Updates pushed**\n\nChanges in commit `a3f7d2e`:\n\n```typescript\n// Fixed security issue\nconst data = JSON.parse(req.body.json);\n\n// Optimized algorithm\nfunction processData(items: Item[]): Result {\n  const lookup = new Map(items.map(i => [i.id, i]));\n  // O(n) instead of O(n²)\n  return items.map(item => ({\n    ...item,\n    related: lookup.get(item.parentId)\n  }));\n}\n\n// Added edge case tests\ndescribe('processData', () => {\n  it('handles empty array', () => {\n    expect(processData([])).toEqual([]);\n  });\n  it('handles single item', () => {\n    expect(processData([{id: 1}])).toHaveLength(1);\n  });\n});\n```\n\nPerformance improvement: 12s → 180ms on 100k items 🚀" },
    { author: "agent-reviewer-1", content: "✅ **Approved**\n\nMuch better! The Map approach is clean and the test coverage looks good. One minor nit: add a comment explaining why we use Map (for future devs).\n\nLGTM - feel free to merge after that." },
    { author: "agent-dev-1", content: "📝 Added comment and merged. Thanks for the thorough review!\n\n```typescript\n// Use Map for O(1) lookups instead of O(n) find()\n// This reduces overall complexity from O(n²) to O(n)\nconst lookup = new Map(items.map(i => [i.id, i]));\n```\n\n**Merged to main.** Closing this PR." },
  ],
  // Conversation 4: Architecture decision
  [
    { author: "alice", content: "Team, we need to decide on caching strategy for the product catalog. Options:\n\n1. **Redis** - Fast, but adds infra complexity\n2. **In-memory (Node)** - Simple, but doesn't scale horizontally\n3. **CDN (CloudFront)** - Great for reads, stale cache concerns\n\nWhat do you think?" },
    { author: "agent-dev-2", content: "🤔 **Analysis:**\n\nBased on our traffic patterns (5M catalog views/day, 99% read):\n\n| Approach | Latency | Scale | Complexity | Cost/mo |\n|----------|---------|-------|------------|---------|\n| Redis | ~2ms | High | Medium | $180 |\n| In-memory | ~0.5ms | Low | Low | $0 |\n| CDN | ~50ms | Very High | Low | $85 |\n\n**Recommendation: Hybrid approach**\n1. CDN for public catalog (handles 95% of traffic)\n2. Redis for user-specific data (cart, favorites)\n3. 5-min TTL with cache invalidation on product updates\n\nThis gives us sub-100ms globally with reasonable complexity." },
    { author: "bob", content: "I like the hybrid approach. How would cache invalidation work when products are updated?" },
    { author: "agent-dev-2", content: "💡 **Invalidation Strategy:**\n\n```typescript\n// On product update\nasync function updateProduct(id: string, data: Product) {\n  // 1. Update database\n  await db.products.update(id, data);\n  \n  // 2. Invalidate CDN cache\n  await cloudfront.invalidate([\n    `/api/products/${id}`,\n    '/api/products/list',\n  ]);\n  \n  // 3. Broadcast to Redis (pub/sub)\n  await redis.publish('product:update', { id, updatedAt: Date.now() });\n}\n\n// Workers subscribe and clear local caches\nredis.subscribe('product:update', (msg) => {\n  localCache.delete(`product:${msg.id}`);\n});\n```\n\n**Staleness window:** ~30 seconds worst case (CDN invalidation time)" },
    { author: "alice", content: "That works for our use case. Can you create a ticket to implement this? Start with the CDN layer since that's highest impact." },
    { author: "agent-dev-2", content: "📝 **Created ticket #1842**\n\n**Phase 1: CDN Layer**\n- CloudFront distribution setup\n- Cache behaviors for `/api/products/*`\n- Invalidation Lambda on product changes\n\n**Phase 2: Redis Layer**\n- ElastiCache cluster\n- User-specific cache logic\n- Pub/sub for invalidation\n\nETA: 3 days for Phase 1, 2 days for Phase 2\n\nAssigning to myself. Will start tomorrow." },
  ],
  // Conversation 5: Testing & CI/CD
  [
    { author: "agent-dev-1", content: "⚠️ **CI Issue:** Tests are flaky in the payment module. Getting random timeouts.\n\nLooking at the last 20 runs:\n- 14 passed\n- 6 failed (all in `payment.test.ts`)\n- Error: `TimeoutError: Element not found: [data-testid=\"confirm-button\"]`\n\nSeems like a race condition in the test setup." },
    { author: "bob", content: "Those tests use the mocked Stripe API. Maybe the mock isn't resetting between tests?" },
    { author: "agent-dev-1", content: "💻 **Found the issue!**\n\nThe Stripe mock was persisting state between tests. Fixed with proper cleanup:\n\n```typescript\n// payment.test.ts\nimport { stripeMock } from './mocks/stripe';\n\ndescribe('Payment Flow', () => {\n  beforeEach(() => {\n    stripeMock.reset();  // ✅ Added this\n    jest.clearAllMocks();\n  });\n  \n  afterEach(async () => {\n    await stripeMock.cleanup();  // ✅ Ensure no lingering promises\n  });\n  \n  it('processes payment successfully', async () => {\n    stripeMock.mockPaymentIntent({ status: 'succeeded' });\n    // ... test\n  });\n});\n```\n\nAlso added `--testTimeout=30000` to Jest config for these integration tests." },
    { author: "agent-dev-1", content: "✅ **PR Created: #253**\n\nChanges:\n- Fixed mock reset between tests\n- Added proper async cleanup\n- Increased timeout for Stripe integration tests\n- Added test retries (2x) for network-dependent tests\n\nCI run: https://github.com/acme/api/actions/runs/12345\n\nAll green! 🟢" },
    { author: "alice", content: "Nice debugging. Can we also add a check to fail the build if test duration exceeds 5 minutes? Our CI costs are creeping up." },
    { author: "agent-dev-1", content: "📋 **Updated PR**\n\nAdded to `jest.config.js`:\n\n```javascript\nmodule.exports = {\n  // ... other config\n  testTimeout: 30000,\n  setupFilesAfterEnv: ['./jest.setup.js'],\n};\n\n// jest.setup.js\nbeforeAll(() => {\n  global.testStartTime = Date.now();\n});\n\nafterAll(() => {\n  const duration = Date.now() - global.testStartTime;\n  const MAX_DURATION = 5 * 60 * 1000; // 5 minutes\n  if (duration > MAX_DURATION) {\n    throw new Error(\n      `Test suite exceeded 5 minute limit: ${duration}ms`\n    );\n  }\n});\n```\n\nThis will fail the build if any test file takes >5min." },
  ],
  // Conversation 6: Database migration
  [
    { author: "agent-dev-2", content: "🏗️ **Planning migration for user preferences**\n\nNeed to add:\n- `notification_settings` (JSONB)\n- `theme_preference` (ENUM)\n- `timezone` (VARCHAR)\n\nTable has 2M rows. Need zero-downtime approach.\n\n**Plan:**\n1. Create new columns (nullable)\n2. Backfill in batches of 10k\n3. Add triggers for sync\n4. Make columns NOT NULL\n5. Drop old columns\n\nThoughts?" },
    { author: "alice", content: "Looks good. What's the estimated downtime for step 4 (making NOT NULL)?" },
    { author: "agent-dev-2", content: "🤔 **Analysis:**\n\nWith 2M rows, making columns NOT NULL requires a table rewrite (~30 seconds lock).\n\n**Alternative approach:**\n```sql\n-- 1. Add CHECK constraint as NOT VALID (no lock)\nALTER TABLE users ADD CONSTRAINT prefs_not_null CHECK (notification_settings IS NOT NULL) NOT VALID;\n\n-- 2. Backfill (chunked, no lock)\n-- 3. Validate constraint (short lock, just metadata)\nALTER TABLE users VALIDATE CONSTRAINT prefs_not_null;\n\n-- 4. Later: make proper NOT NULL using the constraint\n```\n\nThis reduces lock time from 30s to <1s." },
    { author: "bob", content: "That approach is much safer. Do we have a rollback plan if something goes wrong?" },
    { author: "agent-dev-2", content: "✅ **Rollback Plan:**\n\n```sql\n-- If backfill fails or issues detected:\nALTER TABLE users DROP CONSTRAINT IF EXISTS prefs_not_null;\n-- Columns remain nullable, app continues working\n\n-- App-level feature flag:\nif (features.userPreferences) {\n  // use new columns\n} else {\n  // use legacy storage\n}\n```\n\nAlso have:\n- Database snapshot from before migration\n- Reversible in < 5 minutes\n- Monitoring alerts on error rates\n\nReady to schedule for tonight's maintenance window?" },
    { author: "alice", content: "Yes, let's do it at 2 AM UTC. Please post in #deployments when you start and finish." },
    { author: "agent-dev-2", content: "🚀 **Migration complete!**\n\n- Started: 02:00 UTC\n- Finished: 02:08 UTC\n- Downtime: 0 seconds (constraint validation took 400ms)\n- Rows migrated: 2,034,567\n- Rollback plan: Not needed ✅\n\nPosted summary in #deployments. Old columns will be dropped in 7 days after validation period." },
  ],
  // Conversation 7: Security audit
  [
    { author: "agent-reviewer-1", content: "🔒 **Security Audit Results**\n\nFound 3 issues in the auth module:\n\n1. **HIGH**: JWT secret stored in env var without rotation\n2. **MEDIUM**: Password reset tokens don't expire\n3. **LOW**: Missing rate limiting on /auth endpoints\n\n```typescript\n// Issue #2 - tokens never expire\nconst token = jwt.sign({ userId }, SECRET);  // 🚫 No exp\n\n// Should be:\nconst token = jwt.sign({ userId }, SECRET, { expiresIn: '1h' });\n```\n\nRecommendations?" },
    { author: "alice", content: "Let's fix all three. For the JWT secret, can we use AWS Secrets Manager with rotation?" },
    { author: "agent-dev-1", content: "💻 **Implementation Plan:**\n\n```typescript\n// 1. JWT Secret Rotation\nimport { SecretsManager } from '@aws-sdk/client-secrets-manager';\nconst secrets = new SecretsManager();\n\nasync function getJwtSecret(): Promise<string> {\n  const secret = await secrets.getSecretValue({ SecretId: 'jwt-secret' });\n  return secret.SecretString!;\n}\n\n// 2. Token expiration\nconst resetToken = jwt.sign(\n  { userId, type: 'password_reset' },\n  await getJwtSecret(),\n  { expiresIn: '1h', jwtid: crypto.randomUUID() }\n);\n\n// 3. Rate limiting\nimport rateLimit from 'express-rate-limit';\nconst authLimiter = rateLimit({\n  windowMs: 15 * 60 * 1000, // 15 min\n  max: 5, // 5 attempts\n  skipSuccessfulRequests: true,\n});\napp.use('/auth/', authLimiter);\n```" },
    { author: "bob", content: "Looks good. Can you also add brute-force protection that locks accounts after 5 failed attempts?" },
    { author: "agent-dev-1", content: "✅ **PR Created: #267**\n\nAdded brute-force protection:\n\n```typescript\n// Account lockout after 5 failed attempts\nasync function checkLoginAttempts(userId: string): Promise<boolean> {\n  const key = `login:attempts:${userId}`;\n  const attempts = await redis.incr(key);\n  \n  if (attempts === 1) {\n    await redis.expire(key, 15 * 60); // 15 min window\n  }\n  \n  if (attempts >= 5) {\n    await lockAccount(userId);\n    await sendSecurityAlert(userId);\n    return false;\n  }\n  \n  return true;\n}\n```\n\n**Security improvements:**\n- JWT secrets rotated every 30 days\n- Password reset expires in 1 hour\n- Rate limiting: 5 req/15min per IP\n- Account lockout after 5 failed logins\n- Security alerts sent to users\n\nAll tests passing. Ready for review." },
  ],
  // Conversation 8: Mobile app release
  [
    { author: "agent-dev-2", content: "📱 **iOS Build Ready for Review**\n\nVersion 2.4.0 (build 2847)\n\n**Changes:**\n- New dashboard design\n- Push notification support\n- Offline mode for reading\n- Bug fixes for dark mode\n\n**TestFlight:** https://testflight.apple.com/join/AbC123\n\nCan someone test on iPhone 14 Pro and iPad?" },
    { author: "carol", content: "Testing now on iPhone 14 Pro. The new dashboard looks great! Found one issue: the pull-to-refresh doesn't work on the notifications tab." },
    { author: "agent-dev-2", content: "🤔 **Investigating...**\n\nFound it. The notifications screen uses a ScrollView inside a FlatList, which breaks pull-to-refresh.\n\n```tsx\n// Before (broken)\n<FlatList\n  data={notifications}\n  renderItem={renderItem}\n  refreshControl={<RefreshControl onRefresh={onRefresh} />}\n>\n  <ScrollView>  // ❌ Nested scroll view breaks refresh\n    <NotificationHeader />\n  </ScrollView>\n</FlatList>\n\n// After (fixed)\n<FlatList\n  data={notifications}\n  renderItem={renderItem}\n  refreshControl={<RefreshControl onRefresh={onRefresh} />}\n  ListHeaderComponent={<NotificationHeader />}  // ✅ Use prop instead\n/>\n```" },
    { author: "carol", content: "Fix confirmed working. Anything else to check?" },
    { author: "agent-dev-2", content: "✅ **Release Checklist Complete**\n\n- [x] iPhone 14 Pro tested (Carol)\n- [x] iPad tested (me)\n- [x] Android Pixel 7 tested\n- [x] Accessibility labels verified\n- [x] Crashlytics shows 0 crashes\n- [x] App Store metadata updated\n\n**Submitting to App Store review.** ETA: 24-48 hours for approval." },
  ],
]

// Chat titles that match the conversations
const CHAT_TITLES = [
  "Rate Limiting Implementation",
  "Production Bug Investigation",
  "Code Review Discussion",
  "Caching Strategy",
  "CI/CD Improvements",
  "Database Migration Planning",
  "Security Audit Fixes",
  "Mobile App Release",
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

  // Run safety checks before any destructive operations
  if (shouldClean && !runSafetyChecks()) {
    console.error("❌ Aborting due to safety check failure")
    process.exit(1)
  }

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
  // Track in_progress and in_review tasks for linking with sessions (model + timing data)
  const inProgressTasks: Array<{
    taskId: string
    projectId: string
    role: Role
    title: string
    isReviewer?: boolean
  }> = []

  // 1. Create Projects
  console.log("   Creating projects...")
  for (let i = 0; i < PROJECTS.length; i++) {
    const p = PROJECTS[i]
    const projectId = generateUUID(SEED_RANGES.projects.start + i, `project[${p.slug}]`)
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
      id: generateUUID(SEED_RANGES.workLoopStates.start + i, `workLoopState[${p.slug}]`),
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

  // 2. Create guaranteed in_progress tasks for each project (for Active Agents display)
  console.log("   Creating guaranteed active tasks per project...")
  const inProgressTaskTitles = [
    "Implement user authentication flow",
    "Add database migration for new schema",
    "Fix race condition in concurrent writes",
    "Optimize API response caching",
    "Implement webhook retry logic",
    "Add request validation middleware",
    "Create feature flag system",
    "Update dependency security patches",
  ]

  for (let pIdx = 0; pIdx < projectIds.length; pIdx++) {
    const projectId = projectIds[pIdx]

    // Create exactly 2 in_progress tasks per project
    for (let j = 0; j < 2; j++) {
      const taskId = generateUUID(2500 + pIdx * 10 + j)
      const role: Role = rng.pick(ROLES)
      const title = inProgressTaskTitles[(pIdx * 2 + j) % inProgressTaskTitles.length]
      const sessionKey = `agent:main:demo:${taskId.slice(0, 8)}`

      taskIds.push(taskId)
      taskIdsByProject[projectId].push(taskId)
      inProgressTasks.push({ taskId, projectId, role, title })

      await client.mutation(api.seed.insertTask, {
        id: taskId,
        project_id: projectId,
        title,
        description: `Implement ${title.toLowerCase()}. This is a high-priority task currently being worked on by an agent.`,
        status: "in_progress",
        priority: rng.pick(["high", "urgent", "medium"]),
        role: role as string,
        assignee: rng.pick(["agent-dev-1", "agent-dev-2", "agent-reviewer-1"]),
        requires_human_review: rng.boolean(0.3),
        tags: JSON.stringify(rng.pickMany(["frontend", "backend", "api", "database", "security", "performance"], rng.range(1, 3))),
        session_id: sessionKey,
        agent_session_key: sessionKey,
        agent_spawned_at: Date.now() - rng.range(300000, 1800000), // 5-30 min ago
        dispatch_status: rng.pick(["active", "spawning"]),
        dispatch_requested_at: Date.now() - rng.range(60000, 3600000),
        dispatch_requested_by: rng.pick(["coordinator", "human-1"]),
        position: j,
        created_at: Date.now() - rng.range(600000, 3600000), // 10-60 min ago
        updated_at: Date.now() - rng.range(0, 300000),
        branch: `fix/${taskId.slice(0, 8)}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`,
        reviewer_rejection_count: 0,
        escalated: false,
      })
    }
  }
  console.log(`      ✓ Created ${projectIds.length * 2} guaranteed in_progress tasks`)

  // 3. Create additional random Tasks (~36-42 across projects)
  console.log("   Creating additional random tasks...")
  const totalTasks = rng.range(36, 42)

  // Track position offset per project (we already created 2 guaranteed tasks per project)
  const positionOffsetByProject: Record<string, number> = {}
  for (const projectId of projectIds) {
    positionOffsetByProject[projectId] = 2
  }

  for (let i = 0; i < totalTasks; i++) {
    const projectId = rng.pick(projectIds)
    const role: Role = rng.pick(ROLES)
    const status: TaskStatus = rng.pick(TASK_STATUSES)
    const title: string = rng.pick(TASK_TITLES[role])
    const taskId = generateUUID(SEED_RANGES.tasks.start + i, `task[${i}]`)

    taskIds.push(taskId)
    taskIdsByProject[projectId].push(taskId)

    // For in_progress tasks, we'll generate a session key that matches a session
    const isInProgress = status === "in_progress"
    const isInReview = status === "in_review"
    const sessionKey = isInProgress ? `agent:main:demo:${taskId.slice(0, 8)}` : undefined
    // in_review tasks should have a recently-completed reviewer session key
    // so they don't trigger OrphanedTaskWarning in the UI
    const reviewerSessionKey = isInReview ? `agent:main:demo:reviewer:${taskId.slice(0, 8)}` : undefined

    if (isInProgress || isInReview) {
      inProgressTasks.push({ taskId, projectId, role, title, isReviewer: isInReview })
    }

    // Get current position offset for this project and increment
    const position = positionOffsetByProject[projectId]++

    // in_review tasks should always have a branch and PR (they came from a dev agent)
    const hasBranch = isInReview || isInProgress || (status !== "backlog" && status !== "ready" && rng.boolean(0.7))
    const hasPR = isInReview || ((status === "done") && rng.boolean(0.8))
    const isEscalated = status === "blocked" || rng.boolean(0.1)
    const rejectionCount = rng.boolean(0.2) ? rng.range(1, 3) : 0
    const priority: TaskPriority = rng.pick(TASK_PRIORITIES)

    // For done tasks, create realistic cycle times (minutes to hours, not days)
    // completed_at should be reasonably close to created_at for realistic cycle times
    let createdAt: number
    let completedAt: number | undefined

    if (status === "done") {
      // Task completed recently (within last 7 days)
      completedAt = Date.now() - rng.range(0, 7 * 24 * 60 * 60 * 1000)
      // Created at shortly before completion (15 min to 4 hours for realistic cycle time)
      const cycleTimeMs = rng.range(15 * 60 * 1000, 4 * 60 * 60 * 1000)
      createdAt = completedAt - cycleTimeMs
    } else {
      // Non-done tasks can have any creation date
      createdAt = rng.dateInRange(10, 0)
    }

    await client.mutation(api.seed.insertTask, {
      id: taskId,
      project_id: projectId,
      title,
      description: `Implement ${title.toLowerCase()}. This is part of the ${PROJECTS.find(p => taskIdsByProject[p.slug === projectId ? projectId : ""] === taskIdsByProject[projectId])?.name || "project"} roadmap.`,
      status,
      priority,
      role: role as string,
      // in_review tasks should always have a reviewer assignee
      assignee: isInReview ? rng.pick(["agent-reviewer-1", "agent-reviewer-2"]) :
        (rng.boolean(0.6) ? rng.pick(["agent-dev-1", "agent-dev-2", "agent-reviewer-1", "human-1"]) : undefined),
      requires_human_review: rng.boolean(0.3),
      tags: JSON.stringify(rng.pickMany(["frontend", "backend", "api", "database", "security", "performance", "testing", "docs"], rng.range(1, 3))),
      session_id: rng.boolean(0.4) ? `agent:main:demo:${taskId.slice(0, 8)}` : undefined,
      // in_progress tasks get active agent session; in_review tasks get a reviewer session
      agent_session_key: sessionKey ?? reviewerSessionKey,
      agent_spawned_at: isInProgress ? Date.now() - rng.range(300000, 1800000) : // 5-30 min ago
        isInReview ? Date.now() - rng.range(60000, 900000) : undefined, // 1-15 min ago for reviewers
      dispatch_status: (isInProgress || isInReview) ? rng.pick(["active", "spawning"]) : undefined,
      dispatch_requested_at: (isInProgress || isInReview) ? Date.now() - rng.range(60000, 3600000) : undefined,
      dispatch_requested_by: rng.pick(["coordinator", "human-1"]),
      position,
      created_at: createdAt,
      updated_at: Date.now() - rng.range(0, 86400000),
      completed_at: completedAt,
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
      id: generateUUID(SEED_RANGES.dependencies.start + i, `dependency[${i}]`),
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
      id: generateUUID(SEED_RANGES.comments.start + i, `comment[${i}]`),
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

  // 5. Create Chats - Guarantee at least 2 chats per project with realistic conversations
  console.log("   Creating chats...")

  // Ensure each project gets at least 2 chats
  let chatIndex = 0
  for (const projectId of projectIds) {
    // Create exactly 2 chats per project
    for (let projectChatIndex = 0; projectChatIndex < 2; projectChatIndex++) {
      const chatId = generateUUID(SEED_RANGES.chats.start + chatIndex, `chat[${chatIndex}]`)
      chatIds.push(chatId)

      // Pick a conversation template (cycle through available ones)
      const conversationTemplate = CHAT_CONVERSATIONS[chatIndex % CHAT_CONVERSATIONS.length]
      const chatTitle = CHAT_TITLES[chatIndex % CHAT_TITLES.length]

      // Get unique participants from the conversation
      const participants = [...new Set(conversationTemplate.map(m => m.author))]

      await client.mutation(api.seed.insertChat, {
        id: chatId,
        project_id: projectId,
        title: chatTitle,
        participants: JSON.stringify(participants),
        session_key: `chat:${projectId}:${chatIndex}`,
        created_at: rng.dateInRange(7, 3),
        updated_at: Date.now() - rng.range(0, 86400000),
      })

      // Create messages from the conversation template (guarantees 10+ messages)
      const baseTime = Date.now() - conversationTemplate.length * rng.range(300000, 600000)
      for (let j = 0; j < conversationTemplate.length; j++) {
        const msg = conversationTemplate[j]
        const messageId = generateUUID(SEED_RANGES.chatMessages.start + chatIndex * 100 + j, `chatMessage[chat=${chatIndex},msg=${j}]`)

        await client.mutation(api.seed.insertChatMessage, {
          id: messageId,
          chat_id: chatId,
          author: msg.author,
          content: msg.content,
          run_id: msg.author.startsWith("agent") ? `run-${chatId.slice(0, 8)}-${j}` : undefined,
          session_key: msg.author.startsWith("agent") ? `session:${chatId}:${j}` : undefined,
          is_automated: msg.author.startsWith("agent"),
          created_at: baseTime + j * rng.range(180000, 300000), // 3-5 min between messages
        })
      }

      chatIndex++
    }
  }
  const totalChats = chatIds.length
  console.log(`      ✓ Created ${totalChats} chats with realistic agent conversations`)

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
      id: generateUUID(SEED_RANGES.workLoopRuns.start + i, `workLoopRun[${i}]`),
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

  // 7. Create Sessions
  // First, create sessions for in_progress tasks (so active agents show model + timing)
  console.log("   Creating sessions...")

  // Create sessions for in_progress and in_review tasks (linked for active agents display)
  for (let i = 0; i < inProgressTasks.length; i++) {
    const { taskId, projectId, title, isReviewer } = inProgressTasks[i]
    // Must match the agent_session_key set on the task
    const sessionKey = isReviewer
      ? `agent:main:demo:reviewer:${taskId.slice(0, 8)}`
      : `agent:main:demo:${taskId.slice(0, 8)}`
    const project = PROJECTS.find(p => {
      const projId = projectIds[PROJECTS.indexOf(p)]
      return projId === projectId
    }) || PROJECTS[0]

    const model = rng.pick(MODELS)
    const tokensInput = rng.range(5000, 80000)
    const tokensOutput = rng.range(2000, 30000)
    const costInput = (tokensInput / 1000000) * model.inputPrice
    const costOutput = (tokensOutput / 1000000) * model.outputPrice
    const sessionCreatedAt = Date.now() - rng.range(300000, 1800000) // 5-30 min ago

    await client.mutation(api.seed.insertSession, {
      id: generateUUID(SEED_RANGES.sessions.start + i, `session[${i}]`),
      session_key: sessionKey,
      session_id: generateUUID(SEED_RANGES.sessions.start + 100 + i, `session.session_id[${i}]`),
      session_type: "agent",
      model: model.id,
      provider: rng.pick(["anthropic", "openai", "google"]),
      status: rng.pick(["active", "idle"]) as SessionStatus,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      tokens_cache_read: rng.boolean(0.3) ? rng.range(100, 5000) : 0,
      tokens_cache_write: rng.boolean(0.1) ? rng.range(100, 2000) : 0,
      tokens_total: tokensInput + tokensOutput,
      cost_input: costInput,
      cost_output: costOutput,
      cost_total: costInput + costOutput,
      last_active_at: Date.now() - rng.range(0, 300000), // Active in last 5 min
      output_preview: `Working on: ${title.slice(0, 60)}...`,
      stop_reason: undefined,
      task_id: taskId,
      project_slug: project.slug,
      file_path: `/tmp/sessions/${sessionKey}.json`,
      created_at: sessionCreatedAt,
      updated_at: Date.now() - rng.range(0, 60000),
      completed_at: undefined,
    })
  }

  // Create additional random sessions for variety
  const additionalSessions = rng.range(8, 12)
  for (let i = 0; i < additionalSessions; i++) {
    const type: SessionType = rng.pick(SESSION_TYPES)
    const status: SessionStatus = rng.pick(SESSION_STATUSES)
    const model = rng.pick(MODELS)
    const tokensInput = rng.range(1000, 50000)
    const tokensOutput = rng.range(500, 20000)
    const costInput = (tokensInput / 1000000) * model.inputPrice
    const costOutput = (tokensOutput / 1000000) * model.outputPrice

    await client.mutation(api.seed.insertSession, {
      id: generateUUID(SEED_RANGES.sessions.start + 50 + i, `additionalSession[${i}]`),
      session_key: `${type}:demo:${Date.now()}-${i}`,
      session_id: generateUUID(SEED_RANGES.sessions.start + 150 + i, `additionalSession.session_id[${i}]`),
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
  const totalSessions = inProgressTasks.length + additionalSessions
  console.log(`      ✓ Created ${totalSessions} sessions (${inProgressTasks.length} linked to active tasks)`)

  // 8. Create Roadmap Data
  console.log("   Creating roadmap data...")
  for (let pIdx = 0; pIdx < projectIds.length; pIdx++) {
    const projectId = projectIds[pIdx]
    let prevPhaseId: string | undefined = undefined

    // Create phases
    for (let i = 0; i < PHASES.length; i++) {
      const phase = PHASES[i]
      const phaseId = generateUUID(SEED_RANGES.phases.start + pIdx * 10 + i, `phase[project=${pIdx},phase=${i}]`)
      const phaseStatus: FeatureStatus = rng.pick(FEATURE_STATUSES)

      await client.mutation(api.seed.insertRoadmapPhase, {
        id: phaseId,
        project_id: projectId,
        number: i + 1,
        name: phase.name,
        goal: phase.goal,
        description: `Phase ${i + 1} of the project focusing on ${phase.goal.toLowerCase()}.`,
        status: phaseStatus,
        depends_on: prevPhaseId ? JSON.stringify([prevPhaseId]) : undefined,
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

      // Store current phase ID for next iteration's depends_on
      prevPhaseId = phaseId

      // Create features for each phase
      const featureCount = rng.range(2, 4)
      for (let j = 0; j < featureCount; j++) {
        const featureId = generateUUID(SEED_RANGES.features.start + pIdx * 100 + i * 10 + j, `feature[project=${pIdx},phase=${i},feature=${j}]`)
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
            id: generateUUID(SEED_RANGES.requirements.start + pIdx * 1000 + i * 100 + j * 10 + k, `req[project=${pIdx},phase=${i},feature=${j},req=${k}]`),
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

  // Role-specific prompt templates
  const ROLE_PROMPTS: Record<PromptRole, { title: string; content: string }> = {
    dev: {
      title: "Developer",
      content: `You are a senior software developer responsible for implementing features and fixing bugs.

CORE PRINCIPLES:
- Write clean, maintainable code following project conventions
- Always include comprehensive tests (unit, integration, e2e as appropriate)
- Optimize for performance without sacrificing readability
- Handle errors gracefully with meaningful messages
- Document significant architectural decisions

WORKFLOW:
1. Understand the requirements fully before coding
2. Consider edge cases and error scenarios
3. Implement the solution incrementally
4. Test thoroughly including edge cases
5. Refactor for clarity before submitting

When stuck, ask specific questions rather than making assumptions.`,
    },
    pm: {
      title: "Project Manager",
      content: `You are a technical project manager responsible for planning and requirements definition.

CORE PRINCIPLES:
- Break down complex features into manageable tasks
- Define clear acceptance criteria for each deliverable
- Identify dependencies and blockers early
- Balance scope, timeline, and quality
- Communicate risks proactively

WORKFLOW:
1. Analyze the feature request thoroughly
2. Define user stories with clear value propositions
3. Create task breakdowns with effort estimates
4. Identify dependencies and sequencing
5. Draft acceptance criteria (Given/When/Then format)

Focus on clarity over comprehensiveness. A well-defined small scope beats a vague large one.`,
    },
    qa: {
      title: "QA Engineer",
      content: `You are a quality assurance engineer responsible for testing and validation.

CORE PRINCIPLES:
- Test from the user's perspective, not just code paths
- Document reproduction steps clearly
- Automate repetitive testing tasks
- Focus on high-impact, high-risk areas first
- Maintain traceability between requirements and tests

WORKFLOW:
1. Review requirements and identify test scenarios
2. Create test cases covering happy path and edge cases
3. Execute manual tests with thorough documentation
4. Identify and file bugs with clear reproduction steps
5. Validate fixes and perform regression testing

A good bug report includes: steps to reproduce, expected behavior, actual behavior, and environment details.`,
    },
    researcher: {
      title: "Researcher",
      content: `You are a technical researcher responsible for evaluating technologies and approaches.

CORE PRINCIPLES:
- Evaluate options objectively with clear criteria
- Consider tradeoffs explicitly (pros/cons)
- Research within time constraints - depth vs breadth
- Cite sources and provide references
- Consider organizational context, not just technical merit

WORKFLOW:
1. Define the research question and scope
2. Identify 3-5 viable options to evaluate
3. Assess each against agreed criteria
4. Document findings with supporting evidence
5. Make a clear recommendation with justification

The goal is decision support, not information accumulation.`,
    },
    reviewer: {
      title: "Code Reviewer",
      content: `You are a senior code reviewer responsible for maintaining code quality and knowledge sharing.

CORE PRINCIPLES:
- Review for correctness, maintainability, and security
- Provide constructive, specific feedback
- Approve when good enough - perfection is not the goal
- Teach through comments - explain the "why"
- Catch bugs, style issues, and architectural concerns

WORKFLOW:
1. Understand the context and requirements
2. Review at multiple levels: architecture, logic, style
3. Test mentally - does this handle edge cases?
4. Provide actionable feedback categorized by severity
5. Approve when issues are addressed or consciously accepted

Code review is a conversation, not a judgment. Assume positive intent.`,
    },
    pe: {
      title: "Prompt Engineer",
      content: `You are a prompt engineer responsible for optimizing AI system prompts.

CORE PRINCIPLES:
- Clarity beats cleverness - prompts should be unambiguous
- Provide examples (few-shot) for complex tasks
- Use structured output formats when precision matters
- Test edge cases systematically
- Version prompts and measure performance

WORKFLOW:
1. Analyze the task and desired output format
2. Draft an initial prompt with clear instructions
3. Test with varied inputs including edge cases
4. Iterate based on failure modes observed
5. Document the prompt's strengths and limitations

Good prompts are like good APIs: clear contracts, predictable behavior, documented edge cases.`,
    },
    analyzer: {
      title: "Analyzer",
      content: `You are a task analyzer responsible for evaluating agent performance and suggesting improvements.

CORE PRINCIPLES:
- Be objective - separate outcomes from process quality
- Look for patterns across multiple tasks
- Suggest specific, actionable amendments
- Distinguish between prompt issues and model limitations
- Track metrics over time

WORKFLOW:
1. Review the task, prompt version, and outcome
2. Identify what went well and what didn't
3. Categorize failure modes (if any)
4. Suggest specific prompt amendments
5. Record confidence level and reasoning

The goal is continuous improvement through systematic analysis.`,
    },
  }

  // Change summaries for version history
  const CHANGE_SUMMARIES = [
    "Initial prompt version",
    "Added specific workflow steps",
    "Expanded core principles section",
    "Improved error handling guidance",
    "Added teaching-oriented language",
    "Clarified decision-making criteria",
    "Added examples and edge case guidance",
    "Streamlined for brevity while keeping key points",
  ]

  // Track all created prompt versions for analyses
  const promptVersionsByRole: Record<string, string[]> = {}

  for (const role of PROMPT_ROLES) {
    promptVersionsByRole[role] = []
    const roleConfig = ROLE_PROMPTS[role]
    const versionCount = rng.range(3, 5) // 3-4 versions per role

    // Create prompt versions
    for (let i = 0; i < versionCount; i++) {
      const promptId = generateUUID(SEED_RANGES.promptVersions.start + PROMPT_ROLES.indexOf(role) * 10 + i, `promptVersion[role=${role},ver=${i}]`)
      promptVersionsByRole[role].push(promptId)

      // Determine A/B test status
      // Make sure at least one role has an A/B test (dev will have it)
      const isABTest = role === "dev" && i === 1 ? true : (i > 0 && rng.boolean(0.3))
      const abStatus: ABStatus | undefined = isABTest ? rng.pick(AB_STATUSES) : undefined

      // Latest version is active
      const isActive = i === versionCount - 1

      await client.mutation(api.seed.insertPromptVersion, {
        id: promptId,
        role,
        model: rng.pick(MODELS).id,
        version: i + 1,
        content: roleConfig.content,
        change_summary: i === 0 ? CHANGE_SUMMARIES[0] : rng.pick(CHANGE_SUMMARIES.slice(1)),
        parent_version_id: i > 0 ? promptVersionsByRole[role][i - 1] : undefined,
        created_by: rng.pick(["alice", "bob", "carol"]),
        active: isActive,
        created_at: rng.dateInRange(21 - i * 5, 14 - i * 5), // Spread out creation dates
        ab_status: isABTest ? abStatus : "none",
        ab_split_percent: isABTest ? rng.range(30, 50) : undefined,
        ab_started_at: isABTest ? Date.now() - rng.range(86400000, 7 * 86400000) : undefined,
        ab_min_tasks: isABTest ? rng.range(10, 50) : undefined,
      })
    }

    // Create task analyses for each version (more for active version)
    for (let i = 0; i < versionCount; i++) {
      const promptId = promptVersionsByRole[role][i]
      const isActiveVersion = i === versionCount - 1
      // Active version gets more analyses
      const analysisCount = isActiveVersion ? rng.range(8, 15) : rng.range(3, 6)

      for (let j = 0; j < analysisCount; j++) {
        const outcome: AnalysisOutcome = rng.pick(ANALYSIS_OUTCOMES)
        const needsAmendment = outcome !== "success" && rng.boolean(0.6)
        const amendmentStatus: AmendmentStatus | undefined = needsAmendment ? rng.pick(AMENDMENT_STATUSES) : undefined

        // Generate role-specific amendments
        let amendmentText: string | undefined
        if (needsAmendment) {
          const amendmentsByRole: Record<PromptRole, string[]> = {
            dev: ["Add specific testing requirements", "Clarify error handling expectations", "Include performance benchmarks"],
            pm: ["Add stakeholder communication steps", "Clarify risk assessment criteria", "Include timeline estimation guidance"],
            qa: ["Add regression testing checklist", "Clarify severity classification", "Include automation priority guidance"],
            researcher: ["Add timeboxing recommendations", "Clarify evaluation criteria", "Include stakeholder alignment steps"],
            reviewer: ["Add security checklist items", "Clarify approval criteria", "Include knowledge sharing prompts"],
            pe: ["Add output format examples", "Clarify token optimization guidance", "Include edge case testing steps"],
            analyzer: ["Add metric collection guidance", "Clarify confidence calibration", "Include pattern recognition hints"],
          }
          amendmentText = rng.pick(amendmentsByRole[role])
        }

        await client.mutation(api.seed.insertTaskAnalysis, {
          id: generateUUID(SEED_RANGES.taskAnalyses.start + PROMPT_ROLES.indexOf(role) * 1000 + i * 100 + j, `taskAnalysis[role=${role},ver=${i},analysis=${j}]`),
          task_id: rng.pick(taskIds),
          session_key: `analysis-${Date.now()}-${role}-${i}-${j}`,
          role,
          model: rng.pick(MODELS).id,
          prompt_version_id: promptId,
          outcome,
          token_count: rng.range(2000, 35000),
          duration_ms: rng.range(10000, 180000),
          failure_modes: outcome !== "success" ? JSON.stringify(rng.pickMany(["timeout", "context_length", "incorrect_output", "hallucination"], rng.range(1, 3))) : undefined,
          amendments: amendmentText,
          amendment_status: amendmentStatus,
          amendment_resolved_at: amendmentStatus === "applied" ? Date.now() - rng.range(0, 86400000) : undefined,
          analysis_summary: rng.pick([
            "Task completed successfully with all requirements met.",
            "Partial implementation - some edge cases need handling.",
            "Good progress but requires follow-up on error handling.",
            "Excellent work with comprehensive test coverage.",
            "Implementation correct but documentation could be improved.",
          ]),
          confidence: rng.range(65, 98) / 100,
          analyzed_at: Date.now() - rng.range(0, 14 * 86400000),
        })
      }
    }

    // Create prompt metrics for all periods
    for (const period of PERIODS) {
      const activeVersionId = promptVersionsByRole[role][promptVersionsByRole[role].length - 1]
      const totalTasks = rng.range(30, 120)
      const successCount = Math.floor(totalTasks * rng.range(60, 85) / 100)
      const failureCount = Math.floor(totalTasks * rng.range(5, 15) / 100)
      const partialCount = Math.floor(totalTasks * rng.range(10, 25) / 100)
      const abandonedCount = totalTasks - successCount - failureCount - partialCount

      await client.mutation(api.seed.insertPromptMetric, {
        id: generateUUID(SEED_RANGES.promptMetrics.start + PROMPT_ROLES.indexOf(role) * 10 + PERIODS.indexOf(period), `promptMetric[role=${role},period=${period}]`),
        role,
        model: rng.pick(MODELS).id,
        prompt_version_id: activeVersionId,
        period,
        period_start: period === "day" ? Date.now() - 86400000 : period === "week" ? Date.now() - 7 * 86400000 : 0,
        total_tasks: totalTasks,
        success_count: successCount,
        failure_count: failureCount,
        partial_count: partialCount,
        abandoned_count: Math.max(0, abandonedCount),
        avg_tokens: rng.range(8000, 20000),
        avg_duration_ms: rng.range(45000, 150000),
        bounce_count: rng.range(2, 15),
        failure_modes: JSON.stringify({
          timeout: rng.range(0, 8),
          error: rng.range(0, 5),
          incorrect_output: rng.range(0, 6),
          context_length: rng.range(0, 3),
        }),
        computed_at: Date.now(),
      })
    }
  }
  console.log("      ✓ Created prompt lab data")

  // 10. Create Notifications
  console.log("   Creating notifications...")
  const notificationCount = rng.range(15, 25)

  for (let i = 0; i < notificationCount; i++) {
    const type: NotificationType = rng.pick(NOTIFICATION_TYPES)
    const severity: Severity = type === "escalation" ? "critical" : rng.pick(SEVERITIES)

    await client.mutation(api.seed.insertNotification, {
      id: generateUUID(SEED_RANGES.notifications.start + i, `notification[${i}]`),
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
      id: generateUUID(SEED_RANGES.events.start + i, `event[${i}]`),
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
      id: generateUUID(SEED_RANGES.signals.start + i, `signal[${i}]`),
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
      id: generateUUID(SEED_RANGES.modelPricing.start + i, `modelPricing[${model.id}]`),
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
      id: generateUUID(SEED_RANGES.taskEvents.start + i, `taskEvent[${i}]`),
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
