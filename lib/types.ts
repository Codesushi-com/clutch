/**
 * OpenClaw API Types
 * Type definitions for the OpenClaw gateway API
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

export interface WebSocketMessage {
  type: 'session.started' | 'session.updated' | 'session.completed' | 'session.cancelled' | 'ping' | 'pong';
  payload: unknown;
  timestamp: string;
}

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

export interface RPCRequest {
  id: string;
  method: string;
  params?: unknown;
}

export interface RPCResponse<T = unknown> {
  id: string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}
