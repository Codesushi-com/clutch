/**
 * Agent Types
 * Type definitions for OpenClaw agents
 */

export type AgentStatus = 'active' | 'idle' | 'offline';

export interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  status: AgentStatus;
  sessionCount: number;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentListResponse {
  agents: Agent[];
  total: number;
}

export interface AgentListParams {
  status?: AgentStatus;
  limit?: number;
  offset?: number;
}