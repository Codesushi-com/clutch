/**
 * Agent role determines what kind of work an agent handles
 */
export type AgentRole = "coordinator" | "executor" | "evaluator" | "scanner"

/**
 * Agent capabilities define what actions an agent can perform
 */
export type AgentCapability =
  | "coordinate"  // Assign work, manage flow
  | "review"      // Review PRs, code, output
  | "escalate"    // Escalate to human
  | "plan"        // Create plans, break down work
  | "code"        // Write code
  | "test"        // Write/run tests
  | "debug"       // Debug issues
  | "pr"          // Create pull requests
  | "verify"      // Verify work is complete
  | "merge"       // Merge pull requests
  | "triage"      // Triage issues/tasks
  | "scan"        // Scan for problems
  | "categorize"  // Categorize/label items

/**
 * Agent definition
 */
export interface Agent {
  /** Unique agent identifier (matches OpenClaw agent config) */
  id: string
  /** Display name */
  name: string
  /** Agent role type */
  role: AgentRole
  /** Model identifier (provider/model format) */
  model: string
  /** Color for UI badges (hex) */
  color: string
  /** Optional avatar URL */
  avatar?: string
  /** What this agent can do */
  capabilities: AgentCapability[]
  /** Optional system prompt or reference to SOUL file */
  systemPrompt?: string
}

/**
 * Agent display info for UI components
 */
export interface AgentDisplay {
  id: string
  name: string
  color: string
  avatar?: string
  role: AgentRole
}
