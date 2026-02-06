/**
 * Session Types
 * Type definitions for OpenClaw sessions and RPC
 */

export type SessionStatus = 'running' | 'idle' | 'completed' | 'error' | 'cancelled';

export type SessionType = 'main' | 'isolated' | 'subagent';

export interface Session {
  id: string;
  name: string;
  type: SessionType;
  model: string;
  /**
   * The actual model used for API calls, extracted from recent messages.
   * This may differ from `model` when a model override is applied (e.g., via cron jobs).
   */
  effectiveModel?: string;
  status: SessionStatus;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cost?: number;
  metadata?: Record<string, unknown>;
}

export interface SessionListResponse {
  sessions: Session[];
  total: number;
}

export interface SessionListParams {
  status?: SessionStatus;
  type?: SessionType;
  model?: string;
  limit?: number;
  offset?: number;
}

// RPC Types
export interface RPCRequest {
  type: "req";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface RPCResponse<T = unknown> {
  type: "res";
  id: string;
  ok: boolean;
  payload?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface RPCError {
  code: number;
  message: string;
  data?: unknown;
}

// Session preview with metadata and message history
export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface SessionPreview {
  session: Session;
  messages: SessionMessage[];
  contextPercentage: number;
}
