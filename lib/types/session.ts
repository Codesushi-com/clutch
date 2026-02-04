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

// WebSocket Session Events
export interface SessionStartedEvent {
  type: 'session.started';
  payload: Session;
}

export interface SessionUpdatedEvent {
  type: 'session.updated';
  payload: {
    id: string;
    changes: Partial<Session>;
  };
}

export interface SessionCompletedEvent {
  type: 'session.completed';
  payload: {
    id: string;
    session: Session;
  };
}

export interface SessionCancelledEvent {
  type: 'session.cancelled';
  payload: {
    id: string;
    reason?: string;
  };
}

export type SessionEvent =
  | SessionStartedEvent
  | SessionUpdatedEvent
  | SessionCompletedEvent
  | SessionCancelledEvent;

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

// Legacy WebSocket message type for backward compatibility
export interface WebSocketMessage {
  type: 'session.started' | 'session.updated' | 'session.completed' | 'session.cancelled' | 'ping' | 'pong';
  payload: unknown;
  timestamp: string;
}
