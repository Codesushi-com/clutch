// Re-export everything from registry (which re-exports types)
export {
  getAgent,
  getAllAgents,
  getAgentsByRole,
  getAgentsByCapability,
  getAgentDisplay,
  getAllAgentDisplays,
} from "./registry"

export type {
  Agent,
  AgentDisplay,
  AgentRole,
  AgentCapability,
} from "./types"
