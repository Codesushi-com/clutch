# Work Loop v2 — Design Sketch

## Problem

The current loop handles every failure mode in code: orphan recovery, observer exemptions, tombstone TTLs, retry counters, analyzer failure recording, reviewer-to-fixer routing, stale session filtering. Each bug fix added a special case. The result is ~400 lines of reaping logic in `loop.ts` alone, none of it testable.

Meanwhile, agents leave comments describing exactly what went wrong — and nobody reads them.

## Core Idea

**Agents signal their outcome. The loop routes signals. Ada makes judgment calls.**

```
Agent → structured signal → Loop (mechanical) → Ada (judgment) → action
```

The loop becomes a dumb state machine. All intelligence moves to the agents (who already have it) and Ada (who can reason about context).

---

## Task State Machine

```
                    ┌──────────────────────────────┐
                    │                              │
                    ▼                              │
 ┌─────────┐   ┌───────┐   ┌─────────────┐   ┌───────┐   ┌──────┐
 │ backlog  │──▶│ ready │──▶│ in_progress │──▶│  done │   │      │
 └─────────┘   └───────┘   └─────────────┘   └───────┘   │triage│
                    ▲            │                         │      │
                    │            │                         └──┬───┘
                    │            ▼                            │
                    │       ┌─────────┐                      │
                    │       │ blocked │──────────────────────▶│
                    │       └─────────┘                       │
                    │            │                            │
                    │            ▼                            │
                    │       ┌──────────────┐                  │
                    └───────│ Ada resolves │◀─────────────────┘
                            └──────────────┘
```

### New States

| State | Meaning | Who acts |
|-------|---------|----------|
| `backlog` | Not ready for work | Human |
| `ready` | Available for agent pickup | Loop |
| `in_progress` | Agent working on it | Agent |
| `in_review` | PR exists, needs review | Loop (spawns reviewer) |
| `blocked` | Agent couldn't complete, left reason | Ada (via triage) |
| `done` | Completed and merged | Nobody |

### Removed Concepts

- **Fixer role** — reviewer feedback goes to `blocked` + triage, not a separate role
- **Analyzer role** — post-merge analysis was producing noise, not value
- **Observer exemptions** — no observers, no exemptions
- **Orphan recovery** — agents that don't signal get one simple rule (see below)
- **Tombstone system** — replaced by `blocked` state (tasks stay blocked until Ada acts)

---

## Agent Signal Contract

Agents communicate via the OpenClutch API. Every agent MUST do one of these before finishing:

### 1. Done — task complete
```bash
curl -X PATCH localhost:3002/api/tasks/{id} \
  -H 'Content-Type: application/json' \
  -d '{"status": "done"}'
```

### 2. Ready for review — PR created
```bash
curl -X PATCH localhost:3002/api/tasks/{id} \
  -H 'Content-Type: application/json' \
  -d '{"status": "in_review", "pr_number": 123, "branch": "fix/abc123"}'
```

### 3. Blocked — can't complete
```bash
# Post structured comment
curl -X POST localhost:3002/api/tasks/{id}/comments \
  -H 'Content-Type: application/json' \
  -d '{
    "author": "agent",
    "author_type": "agent",
    "type": "blocker",
    "content": "Cannot implement: the API endpoint /api/widgets described in the task does not exist. Checked routes in app/api/ — no widgets route. Need clarification on which endpoint to use."
  }'

# Move to blocked
curl -X PATCH localhost:3002/api/tasks/{id} \
  -H 'Content-Type: application/json' \
  -d '{"status": "blocked"}'
```

### 4. Need input — has a specific question
```bash
curl -X POST localhost:3002/api/tasks/{id}/comments \
  -H 'Content-Type: application/json' \
  -d '{
    "author": "agent",
    "author_type": "agent",
    "type": "request_input",
    "content": "The task says to add a chart component. Should I use recharts (already a dependency) or the Victory library mentioned in the description?"
  }'

curl -X PATCH localhost:3002/api/tasks/{id} \
  -H 'Content-Type: application/json' \
  -d '{"status": "blocked"}'
```

### The silent failure case

If an agent finishes without signaling (crash, timeout, NO_REPLY):
1. Loop detects agent gone (JSONL `stopReason: "stop"` or stale mtime)
2. Task still `in_progress` with no signal → move to `blocked`
3. Add comment: "Agent terminated without status update. Session: {key}. Check session logs."
4. Route to Ada for triage

**One rule. No retry counter. No role checks. No orphan heuristics.**

---

## Loop Architecture (v2)

The loop becomes three phases:

### Phase 1: Reap
Check active agents. For each finished agent:
- Read task status (did agent update it?)
- If task moved to `done`/`in_review`/`blocked` → agent signaled correctly, nothing to do
- If task still `in_progress` → silent failure → move to `blocked` + auto-comment

### Phase 2: Dispatch
- Query `ready` tasks (sorted by priority, filtered by deps)
- Respect capacity limits
- Claim and spawn agent with role-appropriate prompt
- One task per project per cycle (current behavior, works fine)

### Phase 3: Review
- Query `in_review` tasks with open PRs
- Spawn reviewer agents (same as today, but reviewer uses signal contract too)

**That's it.** No cleanup phase. No signals phase. No notify phase. No analyze phase.

### What about `blocked` tasks?

The loop doesn't touch them. A separate mechanism handles triage:

---

## Triage: Ada as Decision Maker

When a task moves to `blocked`, the loop sends a message to Ada's main session:

```
📋 Task blocked: {title} [{id}]
Project: {project_name}
Role: {role}
Agent comment:
> {last comment content}

Previous attempts: {count}
PR: #{pr_number} (if exists)
Branch: {branch} (if exists)

What should I do with this?
```

### Ada's options:

1. **Retry with updated instructions** — Ada edits the task description with more context, moves to `ready`
2. **Reassign role** — task needs a different approach (e.g., dev→research)
3. **Update and retry** — fix the underlying issue (e.g., create the missing API route), then move to `ready`
4. **Escalate to Dan** — "Hey, this task is unclear, what did you mean by X?"
5. **Kill it** — move to `backlog` or delete. Not worth doing.

### Implementation

The loop calls `sessions_send` to Ada's main session via OpenClaw gateway RPC:

```typescript
// In the loop's triage handler
await gatewayRpc.send({
  method: "sessions.send",
  params: {
    sessionKey: "main",
    message: triageMessage
  }
})
```

Ada responds naturally. The loop doesn't need to parse Ada's response — Ada takes action directly (updates task via API, moves status, posts comments).

### Async flow:
1. Task moves to `blocked` → triage message sent to Ada
2. Loop records `triage_sent_at` timestamp on task
3. Loop ignores `blocked` tasks (doesn't retry, doesn't reap)
4. Ada acts when she gets to it (updates task, moves to `ready` or `backlog`)
5. Next cycle picks it up from `ready` if Ada re-queued it

**No polling. No response parsing. No synchronous waiting.**

---

## Dependency Chains

Current dependency system stays as-is — it works:
- `task_dependencies` table with `task_id` → `depends_on_id`
- `areDependenciesMet()` checks all deps are `done` before dispatch
- `blocked` doesn't break deps — downstream tasks just wait

### New: blocked propagation awareness

If Task B depends on Task A, and Task A is `blocked`, Ada can see this in triage:
"Task A is blocking 3 downstream tasks. Priority: resolve or restructure."

---

## Reviewer Simplification

Current reviewer flow:
1. Reviewer finishes → `handleReviewerReap` runs 50+ lines of logic
2. Checks if task is done (merged) or still in_review (changes requested)
3. If changes requested → set role=fixer, store review_comments, move to ready
4. Fixer picks up, applies fixes, creates new commit, back to in_review
5. Repeat until merged or max retries

**v2 reviewer flow:**
1. Reviewer merges → updates task to `done` (signal contract)
2. Reviewer rejects → posts comment with feedback, moves to `blocked`
3. Ada triages: reads feedback, decides if it's worth fixing
4. If yes: Ada updates task with specific fix instructions, moves to `ready`
5. Original dev role picks it up (not a special "fixer" role)

This eliminates: `handleReviewerReap`, fixer role, `review_comments` field, `review_count` tracking.

---

## Testable Decision Engine

The key insight: separate **what to do** from **doing it**.

```typescript
// Pure function — no side effects, fully testable
interface LoopInput {
  task: Task
  agentStatus: "running" | "finished" | "stale" | "none"
  lastComment: Comment | null
  hasOpenPR: boolean
  dependenciesMet: boolean
  capacityAvailable: boolean
}

type LoopAction =
  | { type: "dispatch"; role: string; model: string }
  | { type: "block"; reason: string }
  | { type: "triage"; message: string }
  | { type: "skip"; reason: string }
  | { type: "done" }

function decide(input: LoopInput): LoopAction {
  // Agent still running → skip
  if (input.agentStatus === "running") {
    return { type: "skip", reason: "agent_active" }
  }

  // Task already done → done
  if (input.task.status === "done") {
    return { type: "done" }
  }

  // Task blocked → skip (Ada handles it)
  if (input.task.status === "blocked") {
    return { type: "skip", reason: "awaiting_triage" }
  }

  // Agent finished but task still in_progress → silent failure
  if (input.agentStatus === "finished" && input.task.status === "in_progress") {
    return { type: "block", reason: "agent_terminated_without_signal" }
  }

  // Task ready, deps met, capacity available → dispatch
  if (input.task.status === "ready" && input.dependenciesMet && input.capacityAvailable) {
    return { type: "dispatch", role: input.task.role ?? "dev", model: getModelForRole(input.task.role ?? "dev") }
  }

  // Task in_review with open PR → dispatch reviewer
  if (input.task.status === "in_review" && input.hasOpenPR) {
    return { type: "dispatch", role: "reviewer", model: "sonnet" }
  }

  return { type: "skip", reason: "no_action_needed" }
}
```

Every edge case is a test:
```typescript
test("silent failure → block + triage", () => {
  const action = decide({
    task: { status: "in_progress", ... },
    agentStatus: "finished",
    lastComment: null,
    ...
  })
  expect(action).toEqual({ type: "block", reason: "agent_terminated_without_signal" })
})

test("blocked task → skip (Ada handles)", () => {
  const action = decide({
    task: { status: "blocked", ... },
    agentStatus: "none",
    ...
  })
  expect(action).toEqual({ type: "skip", reason: "awaiting_triage" })
})
```

---

## Roles (Simplified)

| Role | Purpose | Model |
|------|---------|-------|
| `dev` | Write code, create PRs | kimi-for-coding |
| `reviewer` | Review PRs, merge or reject | sonnet |
| `pm` | Triage rough ideas into specs | sonnet |
| `research` | Investigation, no code output | sonnet |

**Removed:** `qa`, `fixer`, `security`, `analyzer`, `any`

- QA → reviewer does this (check types, lint, scope)
- Fixer → dev with updated instructions
- Security → reviewer checks this
- Analyzer → removed entirely (wasn't adding value)
- Any → explicit role required

---

## Migration Path

This isn't a rewrite. It's a simplification in stages:

### Stage 1: Add `blocked` status + signal contract
- Add `blocked` to `TaskStatus` type + Convex schema
- Update agent prompts with signal contract
- Add triage message sender (loop → Ada main session)
- **Keep existing reaping logic** as fallback

### Stage 2: Simplify reaping
- Remove orphan recovery (replaced by block + triage)
- Remove observer exemptions (no observers)
- Remove tombstone system (blocked state replaces it)
- Remove analyzer phase
- Remove fixer role handling

### Stage 3: Extract decision engine
- Pull `decide()` function out of loop
- Write tests for every state transition
- Loop becomes: gather inputs → decide → execute

### Stage 4: Remove dead code
- Delete unused roles, phases, config fields
- Clean up prompts
- Remove `review_comments`, `review_count` fields if no longer needed

---

## What This Buys Us

| Before | After |
|--------|-------|
| ~400 lines of reaping logic | ~30 lines (check signal, block if missing) |
| 7 roles with special cases | 4 roles, uniform behavior |
| 6 phases per cycle | 3 phases per cycle |
| Untestable imperative loop | Pure `decide()` function + tests |
| Silent failures → retry thrash | Silent failures → Ada triage |
| Reviewer → fixer → reviewer loop | Reviewer → blocked → Ada → dev |
| Agent comments ignored | Comments are the primary signal |
| Dan gets pinged for everything | Ada handles most, Dan gets the hard ones |

---

## Decisions (2026-02-07)

1. **Triage batching** — Yes. One message per cycle with all newly-blocked tasks, not individual pings. Ada prioritizes and sees patterns across them.

2. **Triage timeout** — No auto-escalation. Dan will be monitoring the system more frequently. Ada acts when she gets to it.

3. **Blocked is flat** — One `blocked` state, no sub-states. Keep it simple. The agent comment has the context.

4. **Reviewer re-rejection → escalate to Dan** — If Ada unblocks a task and the reviewer rejects it again, Ada flags Dan directly. This catches the case where Ada's fix wasn't actually right.

5. **Categorized triage log** — When Ada resolves a triage, she tags the resolution category (e.g., `bad_spec`, `missing_context`, `agent_limitation`, `infra_issue`). Kept as a running list. Dan and Ada review it together daily to find systemic patterns.

## Triage Log

Lives in Ada's memory (`memory/triage-log.md`). Each resolution gets a timestamped entry with category tag. Dan asks Ada for patterns whenever he wants — no fixed cadence.
