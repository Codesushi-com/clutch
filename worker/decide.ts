/**
 * Pure decision function for the work loop.
 * Given task state + agent status → returns an action.
 * No side effects. No imports from external systems.
 */

export interface DecideInput {
  task: {
    id: string
    status: "backlog" | "ready" | "in_progress" | "in_review" | "blocked" | "done"
    role: string | null
    pr_number: number | null
    triage_sent_at: number | null
  }
  agentStatus: "running" | "finished" | "stale" | "none"
  hasOpenPR: boolean
  dependenciesMet: boolean
  capacityAvailable: boolean
  reviewerCapacityAvailable: boolean
}

export type LoopAction =
  | { type: "dispatch"; role: string }
  | { type: "dispatch_reviewer" }
  | { type: "block"; reason: string }
  | { type: "skip"; reason: string }
  | { type: "noop" }

/**
 * Decide what action to take for a task based on its state and system conditions.
 * 
 * Decision Rules (in priority order):
 * 1. Task `done` → `noop`
 * 2. Task `blocked` → `skip` (awaiting_triage)
 * 3. Agent `running` → `skip` (agent_active)
 * 4. Task `in_progress` + agent finished/stale → `block` (agent_terminated_without_signal)
 * 5. Task `in_review` + open PR + reviewer capacity → `dispatch_reviewer`
 * 6. Task `in_review` + no PR + no agent → `block` (in_review_without_pr)
 * 7. Task `ready` + deps met + capacity → `dispatch`
 * 8. Task `ready` + deps not met → `skip` (dependencies_not_met)
 * 9. Task `ready` + no capacity → `skip` (no_capacity)
 * 10. Otherwise → `noop`
 */
export function decide(input: DecideInput): LoopAction {
  const { task, agentStatus, hasOpenPR, dependenciesMet, capacityAvailable, reviewerCapacityAvailable } = input

  // Rule 1: Task done → noop
  if (task.status === "done") {
    return { type: "noop" }
  }

  // Rule 2: Task blocked → skip (awaiting_triage)
  if (task.status === "blocked") {
    return { type: "skip", reason: "awaiting_triage" }
  }

  // Rule 3: Agent running → skip (agent_active)
  if (agentStatus === "running") {
    return { type: "skip", reason: "agent_active" }
  }

  // Rule 4: Task in_progress + agent finished/stale → block (agent_terminated_without_signal)
  if (task.status === "in_progress" && (agentStatus === "finished" || agentStatus === "stale")) {
    return { type: "block", reason: "agent_terminated_without_signal" }
  }

  // Rule 5: Task in_review + open PR + reviewer capacity → dispatch_reviewer
  if (task.status === "in_review" && hasOpenPR && reviewerCapacityAvailable) {
    return { type: "dispatch_reviewer" }
  }

  // Rule 6: Task in_review + no PR + no agent → block (in_review_without_pr)
  if (task.status === "in_review" && !hasOpenPR && agentStatus === "none") {
    return { type: "block", reason: "in_review_without_pr" }
  }

  // Rule 7: Task ready + deps met + capacity → dispatch
  if (task.status === "ready" && dependenciesMet && capacityAvailable) {
    const role = task.role ?? "dev"
    return { type: "dispatch", role }
  }

  // Rule 8: Task ready + deps not met → skip (dependencies_not_met)
  if (task.status === "ready" && !dependenciesMet) {
    return { type: "skip", reason: "dependencies_not_met" }
  }

  // Rule 9: Task ready + no capacity → skip (no_capacity)
  if (task.status === "ready" && !capacityAvailable) {
    return { type: "skip", reason: "no_capacity" }
  }

  // Rule 10: Otherwise → noop
  return { type: "noop" }
}
