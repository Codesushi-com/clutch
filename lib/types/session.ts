/**
 * Session Types
 * Type definitions for OpenClaw sessions
 *
 * Re-exports from @/convex/sessions for backwards compatibility.
 * New code should import directly from @/convex/sessions.
 */

export type {
  Session,
  SessionType,
  SessionStatus,
  SessionInput,
} from "@/convex/sessions";

// Legacy type aliases for backwards compatibility
export type SessionListResponse = {
  sessions: import("@/convex/sessions").Session[];
  total: number;
};

export type SessionListParams = {
  status?: import("@/convex/sessions").SessionStatus;
  sessionType?: import("@/convex/sessions").SessionType;
  /** @deprecated Use sessionType instead */
  type?: import("@/convex/sessions").SessionType;
  model?: string;
  limit?: number;
  offset?: number;
};

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
  session: import("@/convex/sessions").Session;
  messages: SessionMessage[];
  contextPercentage: number;
}
