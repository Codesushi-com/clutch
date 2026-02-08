import { describe, it, expect } from "vitest"
import { decide, type DecideInput } from "../decide"

// Helper to create a base input that can be overridden
const defaultInput = (): DecideInput => ({
  task: {
    id: "task-123",
    status: "ready",
    role: "dev",
    pr_number: null,
    triage_sent_at: null,
  },
  agentStatus: "none",
  hasOpenPR: false,
  dependenciesMet: true,
  capacityAvailable: true,
  reviewerCapacityAvailable: true,
})

describe("decide()", () => {
  describe("Rule 1: Task done → noop", () => {
    it("noops on done task", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "done" },
      }
      const result = decide(input)
      expect(result).toEqual({ type: "noop" })
    })

    it("noops on done task even with running agent", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "done" },
        agentStatus: "running",
      }
      const result = decide(input)
      expect(result).toEqual({ type: "noop" })
    })

    it("noops on done task even with available capacity", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "done" },
        capacityAvailable: true,
        dependenciesMet: true,
      }
      const result = decide(input)
      expect(result).toEqual({ type: "noop" })
    })
  })

  describe("Rule 2: Task blocked → skip (awaiting_triage)", () => {
    it("skips blocked task (awaiting_triage)", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "blocked" },
      }
      const result = decide(input)
      expect(result).toEqual({ type: "skip", reason: "awaiting_triage" })
    })

    it("skips blocked task even with available capacity", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "blocked" },
        capacityAvailable: true,
        dependenciesMet: true,
      }
      const result = decide(input)
      expect(result).toEqual({ type: "skip", reason: "awaiting_triage" })
    })

    it("skips blocked task even without agent running", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "blocked" },
        agentStatus: "none",
      }
      const result = decide(input)
      expect(result).toEqual({ type: "skip", reason: "awaiting_triage" })
    })
  })

  describe("Rule 3: Agent running → skip (agent_active)", () => {
    it("skips when agent is running (ready task)", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "ready" },
        agentStatus: "running",
      }
      const result = decide(input)
      expect(result).toEqual({ type: "skip", reason: "agent_active" })
    })

    it("skips when agent is running (in_review task)", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "in_review" },
        agentStatus: "running",
      }
      const result = decide(input)
      expect(result).toEqual({ type: "skip", reason: "agent_active" })
    })

    it("skips when agent is running even with capacity available", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "ready" },
        agentStatus: "running",
        capacityAvailable: true,
        dependenciesMet: true,
      }
      const result = decide(input)
      expect(result).toEqual({ type: "skip", reason: "agent_active" })
    })

    it("skips when agent is running (in_progress task)", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "in_progress" },
        agentStatus: "running",
      }
      const result = decide(input)
      expect(result).toEqual({ type: "skip", reason: "agent_active" })
    })
  })

  describe("Rule 4: in_progress + finished/stale agent → block", () => {
    it("blocks silent failure (in_progress + finished)", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "in_progress" },
        agentStatus: "finished",
      }
      const result = decide(input)
      expect(result).toEqual({ type: "block", reason: "agent_terminated_without_signal" })
    })

    it("blocks stale agent (in_progress + stale)", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "in_progress" },
        agentStatus: "stale",
      }
      const result = decide(input)
      expect(result).toEqual({ type: "block", reason: "agent_terminated_without_signal" })
    })
  })

  describe("Rule 5: in_review + open PR + reviewer capacity → dispatch_reviewer", () => {
    it("dispatches reviewer for in_review with PR", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "in_review", pr_number: 42 },
        agentStatus: "none",
        hasOpenPR: true,
        reviewerCapacityAvailable: true,
      }
      const result = decide(input)
      expect(result).toEqual({ type: "dispatch_reviewer" })
    })

    it("does not dispatch reviewer when no capacity", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "in_review", pr_number: 42 },
        agentStatus: "none",
        hasOpenPR: true,
        reviewerCapacityAvailable: false,
      }
      const result = decide(input)
      // Falls through to noop since in_review + no PR check doesn't apply (has PR)
      // and no other rule matches
      expect(result).toEqual({ type: "noop" })
    })

    it("does not dispatch reviewer when no open PR", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "in_review" },
        agentStatus: "none",
        hasOpenPR: false,
        reviewerCapacityAvailable: true,
      }
      const result = decide(input)
      // This falls through to Rule 6: in_review + no PR + no agent → block
      expect(result).toEqual({ type: "block", reason: "in_review_without_pr" })
    })
  })

  describe("Rule 6: in_review + no PR + no agent → block", () => {
    it("blocks in_review without PR", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "in_review" },
        agentStatus: "none",
        hasOpenPR: false,
      }
      const result = decide(input)
      expect(result).toEqual({ type: "block", reason: "in_review_without_pr" })
    })

    it("does not block in_review without PR when agent is running", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "in_review" },
        agentStatus: "running",
        hasOpenPR: false,
      }
      const result = decide(input)
      // Rule 3 takes precedence: agent running → skip
      expect(result).toEqual({ type: "skip", reason: "agent_active" })
    })
  })

  describe("Rule 7: ready + deps met + capacity → dispatch", () => {
    it("dispatches ready task with capacity", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "ready", role: "dev" },
        agentStatus: "none",
        dependenciesMet: true,
        capacityAvailable: true,
      }
      const result = decide(input)
      expect(result).toEqual({ type: "dispatch", role: "dev" })
    })

    it("uses task role for dispatch (not hardcoded 'dev')", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "ready", role: "qa" },
        agentStatus: "none",
        dependenciesMet: true,
        capacityAvailable: true,
      }
      const result = decide(input)
      expect(result).toEqual({ type: "dispatch", role: "qa" })
    })

    it("uses task role 'research' for dispatch", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "ready", role: "research" },
        agentStatus: "none",
        dependenciesMet: true,
        capacityAvailable: true,
      }
      const result = decide(input)
      expect(result).toEqual({ type: "dispatch", role: "research" })
    })

    it("handles null role (defaults to 'dev')", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "ready", role: null },
        agentStatus: "none",
        dependenciesMet: true,
        capacityAvailable: true,
      }
      const result = decide(input)
      expect(result).toEqual({ type: "dispatch", role: "dev" })
    })
  })

  describe("Rule 8: ready + deps not met → skip", () => {
    it("skips when deps not met", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "ready" },
        agentStatus: "none",
        dependenciesMet: false,
        capacityAvailable: true,
      }
      const result = decide(input)
      expect(result).toEqual({ type: "skip", reason: "dependencies_not_met" })
    })

    it("skips when deps not met even with capacity", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "ready" },
        agentStatus: "none",
        dependenciesMet: false,
        capacityAvailable: true,
      }
      const result = decide(input)
      expect(result).toEqual({ type: "skip", reason: "dependencies_not_met" })
    })
  })

  describe("Rule 9: ready + no capacity → skip", () => {
    it("skips when no capacity", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "ready" },
        agentStatus: "none",
        dependenciesMet: true,
        capacityAvailable: false,
      }
      const result = decide(input)
      expect(result).toEqual({ type: "skip", reason: "no_capacity" })
    })

    it("skips when no capacity even with deps met", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "ready" },
        agentStatus: "none",
        dependenciesMet: true,
        capacityAvailable: false,
      }
      const result = decide(input)
      expect(result).toEqual({ type: "skip", reason: "no_capacity" })
    })
  })

  describe("Rule 10: Otherwise → noop", () => {
    it("noops on backlog task", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "backlog" },
        agentStatus: "none",
      }
      const result = decide(input)
      expect(result).toEqual({ type: "noop" })
    })

    it("noops on in_review with PR but no reviewer capacity", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "in_review", pr_number: 42 },
        agentStatus: "none",
        hasOpenPR: true,
        reviewerCapacityAvailable: false,
      }
      const result = decide(input)
      expect(result).toEqual({ type: "noop" })
    })

    it("noops when in_progress with no agent", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "in_progress" },
        agentStatus: "none",
      }
      const result = decide(input)
      // Rule 4 only applies to finished/stale, not "none"
      // This falls through to Rule 10: Otherwise → noop
      expect(result).toEqual({ type: "noop" })
    })
  })

  describe("Priority ordering", () => {
    it("Rule 1 (done) takes precedence over Rule 3 (agent running)", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "done" },
        agentStatus: "running",
      }
      const result = decide(input)
      expect(result).toEqual({ type: "noop" })
    })

    it("Rule 2 (blocked) takes precedence over Rule 3 (agent running)", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "blocked" },
        agentStatus: "running",
      }
      const result = decide(input)
      expect(result).toEqual({ type: "skip", reason: "awaiting_triage" })
    })

    it("Rule 3 (agent running) takes precedence over Rule 4 (in_progress)", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "in_progress" },
        agentStatus: "running",
      }
      const result = decide(input)
      expect(result).toEqual({ type: "skip", reason: "agent_active" })
    })

    it("Rule 4 (in_progress + finished) takes precedence over Rule 7 (ready)", () => {
      // This is implicit since status can't be both, but verifies ordering
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "in_progress" },
        agentStatus: "finished",
      }
      const result = decide(input)
      expect(result).toEqual({ type: "block", reason: "agent_terminated_without_signal" })
    })
  })

  describe("Edge cases", () => {
    it("handles null role as 'dev'", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "ready", role: null },
        agentStatus: "none",
        dependenciesMet: true,
        capacityAvailable: true,
      }
      const result = decide(input)
      expect(result).toEqual({ type: "dispatch", role: "dev" })
    })

    it("preserves empty string role (not treated as null)", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "ready", role: "" },
        agentStatus: "none",
        dependenciesMet: true,
        capacityAvailable: true,
      }
      const result = decide(input)
      // Empty string is a valid string, not null/undefined, so it's preserved
      // Note: ?? only handles null/undefined, not empty string
      expect(result).toEqual({ type: "dispatch", role: "" })
    })

    it("preserves explicit role 'pm'", () => {
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "ready", role: "pm" },
        agentStatus: "none",
        dependenciesMet: true,
        capacityAvailable: true,
      }
      const result = decide(input)
      expect(result).toEqual({ type: "dispatch", role: "pm" })
    })

    it("handles in_review with PR number but hasOpenPR is false", () => {
      // PR number exists but hasOpenPR is false (e.g., PR was closed)
      const input: DecideInput = {
        ...defaultInput(),
        task: { ...defaultInput().task, status: "in_review", pr_number: 42 },
        agentStatus: "none",
        hasOpenPR: false,
        reviewerCapacityAvailable: true,
      }
      const result = decide(input)
      // Should block since hasOpenPR is false
      expect(result).toEqual({ type: "block", reason: "in_review_without_pr" })
    })
  })
})
