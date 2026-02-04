import type { Agent, AgentDisplay, AgentRole } from "./types"

/**
 * Built-in agent definitions
 * 
 * These match OpenClaw agent configurations.
 * In the future, this could move to database for runtime editing.
 */
const AGENTS: Agent[] = [
  {
    id: "ada",
    name: "Ada",
    role: "coordinator",
    model: "anthropic/claude-opus-4-5",
    color: "#a855f7", // Purple
    capabilities: ["coordinate", "review", "escalate", "plan"],
  },
  {
    id: "kimi-coder",
    name: "Kimi",
    role: "executor",
    model: "moonshot/kimi-for-coding",
    color: "#3b82f6", // Blue
    capabilities: ["code", "test", "debug", "pr"],
  },
  {
    id: "sonnet-reviewer",
    name: "Sonnet",
    role: "evaluator",
    model: "anthropic/claude-sonnet-4-20250514",
    color: "#22c55e", // Green
    capabilities: ["review", "verify", "merge"],
  },
  {
    id: "haiku-triage",
    name: "Haiku",
    role: "scanner",
    model: "anthropic/claude-haiku-4-5",
    color: "#eab308", // Yellow
    capabilities: ["triage", "scan", "categorize"],
  },
]

/**
 * Get agent by ID
 */
export function getAgent(id: string): Agent | undefined {
  return AGENTS.find((agent) => agent.id === id)
}

/**
 * Get all agents
 */
export function getAllAgents(): Agent[] {
  return [...AGENTS]
}

/**
 * Get agents by role
 */
export function getAgentsByRole(role: AgentRole): Agent[] {
  return AGENTS.filter((agent) => agent.role === role)
}

/**
 * Get agents with a specific capability
 */
export function getAgentsByCapability(capability: string): Agent[] {
  return AGENTS.filter((agent) => 
    agent.capabilities.includes(capability as Agent["capabilities"][number])
  )
}

/**
 * Get agent display info for UI components
 */
export function getAgentDisplay(id: string): AgentDisplay | undefined {
  const agent = getAgent(id)
  if (!agent) return undefined
  
  return {
    id: agent.id,
    name: agent.name,
    color: agent.color,
    avatar: agent.avatar,
    role: agent.role,
  }
}

/**
 * Get all agent display info
 */
export function getAllAgentDisplays(): AgentDisplay[] {
  return AGENTS.map((agent) => ({
    id: agent.id,
    name: agent.name,
    color: agent.color,
    avatar: agent.avatar,
    role: agent.role,
  }))
}

// Re-export types for convenience
export type { Agent, AgentDisplay, AgentRole, AgentCapability } from "./types"
