/**
 * OpenClaw HTTP API Client
 * 
 * Direct HTTP client for OpenClaw gateway API.
 * Replaces WebSocket RPC for session management operations.
 */

import {
  Session,
  SessionListResponse,
  SessionListParams,
  SessionPreview,
  SessionType,
} from "@/lib/types";

// OpenClaw HTTP API configuration
const OPENCLAW_URL = process.env.NEXT_PUBLIC_OPENCLAW_HTTP_URL || "http://127.0.0.1:4440";
const OPENCLAW_TOKEN = process.env.NEXT_PUBLIC_OPENCLAW_TOKEN || "";

// Generate UUID for RPC requests
function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// RPC request/response types
interface RPCRequest {
  type: "req";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface RPCResponse<T = unknown> {
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

// Make an RPC call to OpenClaw HTTP endpoint
async function rpcCall<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  const request: RPCRequest = {
    type: "req",
    id: generateUUID(),
    method,
    params: params || {},
  };

  const response = await fetch(`${OPENCLAW_URL}/rpc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(OPENCLAW_TOKEN ? { Authorization: `Bearer ${OPENCLAW_TOKEN}` } : {}),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`OpenClaw HTTP ${response.status}: ${response.statusText}`);
  }

  const rpcResponse: RPCResponse<T> = await response.json();

  if (!rpcResponse.ok || rpcResponse.error) {
    throw new Error(rpcResponse.error?.message || "OpenClaw RPC error");
  }

  return rpcResponse.payload as T;
}

// Map OpenClaw session key to session ID
function sessionKeyToId(key: string): string {
  return key;
}

// Map OpenClaw session kind to SessionType
function mapSessionKind(kind: string): SessionType {
  switch (kind) {
    case "main":
      return "main";
    case "isolated":
      return "isolated";
    case "subagent":
      return "subagent";
    default:
      return "main";
  }
}

/**
 * List all sessions from OpenClaw
 */
export async function listSessions(params?: SessionListParams): Promise<SessionListResponse> {
  const response = await rpcCall<{ sessions: Array<Record<string, unknown>> }>(
    "sessions.list",
    (params || {}) as Record<string, unknown>
  );

  const sessions = (response.sessions || []).map((s) => ({
    id: sessionKeyToId(s.key as string),
    name: (s.key as string)?.split(":").pop() || "unknown",
    type: mapSessionKind((s.kind as string) || "main"),
    model: (s.model as string) || "unknown",
    status: "idle" as const,
    updatedAt: (s.updatedAt as string) || new Date().toISOString(),
    createdAt: (s.updatedAt as string) || new Date().toISOString(),
    tokens: {
      input: (s.inputTokens as number) || 0,
      output: (s.outputTokens as number) || 0,
      total: (s.totalTokens as number) || 0,
    },
  }));

  return { sessions, total: sessions.length };
}

/**
 * List sessions with effective model extracted from recent messages
 */
export async function listSessionsWithEffectiveModel(
  params?: SessionListParams
): Promise<SessionListResponse> {
  const response = await rpcCall<{ sessions: Array<Record<string, unknown>> }>(
    "sessions.list",
    (params || {}) as Record<string, unknown>
  );

  const sessionRows = response.sessions || [];
  const sessionKeys = sessionRows.map((s) => s.key as string);

  // Fetch previews to get actual model from messages
  let previewData: {
    previews?: Array<{ key: string; items?: Array<{ role?: string; model?: string }> }>;
  } = {};
  
  if (sessionKeys.length > 0) {
    try {
      previewData = await rpcCall<{
        previews: Array<{ key: string; items?: Array<{ role?: string; model?: string }> }>;
      }>("sessions.preview", { keys: sessionKeys, limit: 5 });
    } catch (err) {
      console.warn("[OpenClaw API] Failed to fetch session previews:", err);
    }
  }

  // Build a map of session key to effective model from preview messages
  const effectiveModelMap = new Map<string, string>();
  for (const preview of previewData.previews || []) {
    for (const item of preview.items || []) {
      if (item.model) {
        effectiveModelMap.set(preview.key, item.model);
        break;
      }
    }
  }

  // Map sessions with effective model
  const sessions = sessionRows.map((s) => {
    const key = s.key as string;
    const effectiveModel = effectiveModelMap.get(key);
    const sessionModel = (s.model as string) || "unknown";

    return {
      id: sessionKeyToId(key),
      name: key?.split(":").pop() || "unknown",
      type: mapSessionKind((s.kind as string) || "main"),
      model: sessionModel,
      effectiveModel: effectiveModel || sessionModel,
      status: "idle" as const,
      updatedAt: (s.updatedAt as string) || new Date().toISOString(),
      createdAt: (s.updatedAt as string) || new Date().toISOString(),
      tokens: {
        input: (s.inputTokens as number) || 0,
        output: (s.outputTokens as number) || 0,
        total: (s.totalTokens as number) || 0,
      },
    };
  });

  return { sessions, total: sessions.length };
}

/**
 * Get model context window size
 */
function getModelContextWindow(model: string): number {
  const lowerModel = model.toLowerCase();

  // Anthropic models
  if (lowerModel.includes("claude-opus-4-6")) return 200000;
  if (lowerModel.includes("claude-opus-4-5")) return 200000;
  if (lowerModel.includes("claude-opus")) return 200000;
  if (lowerModel.includes("claude-sonnet-4")) return 200000;
  if (lowerModel.includes("claude-sonnet")) return 200000;
  if (lowerModel.includes("claude-haiku")) return 200000;
  if (lowerModel.includes("claude")) return 200000;

  // Moonshot / Kimi models
  if (lowerModel.includes("kimi-k2-thinking") || lowerModel.includes("kimi-k2.5-thinking"))
    return 131072;
  if (lowerModel.includes("kimi-k2")) return 256000;
  if (lowerModel.includes("kimi-for-coding")) return 262144;
  if (lowerModel.includes("kimi")) return 200000;
  if (lowerModel.includes("moonshot")) return 200000;

  // OpenAI models
  if (lowerModel.includes("gpt-4.5")) return 128000;
  if (lowerModel.includes("gpt-4o")) return 128000;
  if (lowerModel.includes("gpt-4-turbo")) return 128000;
  if (lowerModel.includes("gpt-4")) return 8192;
  if (lowerModel.includes("gpt-3.5-turbo")) return 16385;
  if (lowerModel.includes("gpt-3.5")) return 4096;
  if (lowerModel.includes("gpt-5")) return 128000;

  // Google models
  if (lowerModel.includes("gemini-1.5-pro")) return 2000000;
  if (lowerModel.includes("gemini-1.5-flash")) return 1000000;
  if (lowerModel.includes("gemini-1.5")) return 1000000;
  if (lowerModel.includes("gemini")) return 1000000;

  // Z.AI / GLM models
  if (lowerModel.includes("glm-4.5")) return 128000;
  if (lowerModel.includes("glm-4")) return 128000;
  if (lowerModel.includes("glm")) return 128000;

  // MiniMax models
  if (lowerModel.includes("minimax")) return 1000000;

  // Default fallback for unknown models (assume 128k)
  return 128000;
}

/**
 * Calculate context percentage
 */
function calculateContextPercentage(tokensTotal: number, model: string): number {
  const contextWindow = getModelContextWindow(model);
  const percentage = (tokensTotal / contextWindow) * 100;
  return Math.min(percentage, 100);
}

/**
 * Get session preview with history
 */
export async function getSessionPreview(
  sessionKey: string,
  limit?: number
): Promise<SessionPreview> {
  type PreviewResponse = {
    ts: number;
    previews: Array<{
      key: string;
      status: "ok" | "empty" | "missing" | "error";
      items: Array<{ role: string; text: string; model?: string }>;
    }>;
  };

  // Fetch both preview and session list data in parallel
  const [previewResponse, sessionsResponse] = await Promise.all([
    rpcCall<PreviewResponse>("sessions.preview", {
      keys: [sessionKey],
      limit: limit || 50,
    }),
    rpcCall<{ sessions: Array<Record<string, unknown>> }>("sessions.list", { limit: 100 }),
  ]);

  const previewEntry = previewResponse.previews?.[0];

  if (!previewEntry || previewEntry.status === "missing") {
    throw new Error(`Session "${sessionKey}" not found`);
  }

  if (previewEntry.status === "error") {
    throw new Error(`Failed to load session "${sessionKey}"`);
  }

  // Transform items into SessionMessage format
  const messages = previewEntry.items.map((item, index) => {
    const role: "user" | "assistant" | "system" =
      item.role === "user" || item.role === "assistant" || item.role === "system"
        ? item.role
        : "assistant";
    return {
      id: `${sessionKey}-msg-${index}`,
      role,
      content: item.text,
      timestamp: new Date().toISOString(),
    };
  });

  // Find session data from sessions.list for accurate token counts
  const sessionData = sessionsResponse.sessions?.find((s) => s.key === sessionKey);

  // Determine the model
  const effectiveModel =
    previewEntry.items.find((i) => i.model)?.model ||
    (sessionData?.model as string) ||
    "unknown";

  // Get token counts
  const tokensTotal = (sessionData?.totalTokens as number) || 0;
  const tokensInput = (sessionData?.inputTokens as number) || 0;
  const tokensOutput = (sessionData?.outputTokens as number) || 0;

  // Calculate context percentage
  const contextPercentage =
    effectiveModel !== "unknown"
      ? calculateContextPercentage(tokensTotal, effectiveModel)
      : 0;

  const session: Session = {
    id: sessionKey,
    name: sessionKey.split(":").pop() || sessionKey,
    type: "main",
    model: effectiveModel,
    status: "idle",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tokens: {
      input: tokensInput,
      output: tokensOutput,
      total: tokensTotal,
    },
  };

  return {
    session,
    messages,
    contextPercentage,
  };
}

/**
 * Reset a session (clear all conversation history)
 */
export async function resetSession(sessionKey: string): Promise<void> {
  await rpcCall<void>("sessions.reset", { sessionKey });
}

/**
 * Compact a session (summarize context to reduce token usage)
 */
export async function compactSession(sessionKey: string): Promise<void> {
  await rpcCall<void>("sessions.compact", { sessionKey });
}

/**
 * Cancel a running session
 */
export async function cancelSession(sessionKey: string): Promise<void> {
  await rpcCall<void>("sessions.cancel", { sessionKey });
}
