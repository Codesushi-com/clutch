/**
 * OpenClaw HTTP API Client
 * 
 * High-level typed API for OpenClaw gateway operations.
 * Uses the HTTP RPC transport - no WebSocket dependency.
 * 
 * All functions work in both client and server contexts.
 */

import { openclawRpc } from './rpc';
import type {
  Session,
  SessionListResponse,
  SessionListParams,
  SessionPreview,
} from '@/lib/types';

// Re-export core RPC for advanced use
export { openclawRpc, isOpenClawAvailable, getGatewayStatus } from './rpc';
export type { GatewayStatus } from './rpc';

// ============================================================================
// Session Management
// ============================================================================

/**
 * Fetch sessions from the /api/sessions/list endpoint (uses OpenClaw CLI).
 * Works from both client and server contexts.
 */
async function fetchSessionsFromApi(params?: SessionListParams): Promise<SessionListResponse> {
  const limit = params?.limit ?? 50;
  const activeMinutes = 60;
  const url = `/api/sessions/list?activeMinutes=${activeMinutes}&limit=${limit}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sessions: HTTP ${response.status}`);
  }

  return response.json() as Promise<SessionListResponse>;
}

/**
 * List all sessions from OpenClaw.
 *
 * Uses the /api/sessions/list endpoint which calls the OpenClaw CLI
 * (`openclaw sessions --json`), avoiding the non-existent HTTP RPC method.
 *
 * @param params - Filter/limit params (optional)
 * @returns List of sessions with metadata
 */
export async function listSessions(
  params?: SessionListParams
): Promise<SessionListResponse> {
  return fetchSessionsFromApi(params);
}

/**
 * List sessions with effective model.
 *
 * The CLI-backed endpoint already returns the model from session metadata.
 * For now this is identical to listSessions — preview-based model extraction
 * can be layered back in if needed.
 */
export async function listSessionsWithEffectiveModel(
  params?: SessionListParams
): Promise<SessionListResponse> {
  return fetchSessionsFromApi(params);
}

/**
 * Get model context window size in tokens.
 */
function getModelContextWindow(model: string): number {
  const lowerModel = model.toLowerCase();

  // Anthropic models
  if (lowerModel.includes('claude-opus-4-6')) return 200000;
  if (lowerModel.includes('claude-opus-4-5')) return 200000;
  if (lowerModel.includes('claude-opus')) return 200000;
  if (lowerModel.includes('claude-sonnet-4')) return 200000;
  if (lowerModel.includes('claude-sonnet')) return 200000;
  if (lowerModel.includes('claude-haiku')) return 200000;
  if (lowerModel.includes('claude')) return 200000;

  // Moonshot / Kimi models
  if (lowerModel.includes('kimi-k2-thinking') || lowerModel.includes('kimi-k2.5-thinking'))
    return 131072;
  if (lowerModel.includes('kimi-k2')) return 256000;
  if (lowerModel.includes('kimi-for-coding')) return 262144;
  if (lowerModel.includes('kimi')) return 200000;
  if (lowerModel.includes('moonshot')) return 200000;

  // OpenAI models
  if (lowerModel.includes('gpt-4.5')) return 128000;
  if (lowerModel.includes('gpt-4o')) return 128000;
  if (lowerModel.includes('gpt-4-turbo')) return 128000;
  if (lowerModel.includes('gpt-4')) return 8192;
  if (lowerModel.includes('gpt-3.5-turbo')) return 16385;
  if (lowerModel.includes('gpt-3.5')) return 4096;
  if (lowerModel.includes('gpt-5')) return 128000;

  // Google models
  if (lowerModel.includes('gemini-1.5-pro')) return 2000000;
  if (lowerModel.includes('gemini-1.5-flash')) return 1000000;
  if (lowerModel.includes('gemini-1.5')) return 1000000;
  if (lowerModel.includes('gemini')) return 1000000;

  // Z.AI / GLM models
  if (lowerModel.includes('glm-4.5')) return 128000;
  if (lowerModel.includes('glm-4')) return 128000;
  if (lowerModel.includes('glm')) return 128000;

  // MiniMax models
  if (lowerModel.includes('minimax')) return 1000000;

  // Default fallback for unknown models (assume 128k)
  return 128000;
}

/**
 * Calculate context percentage based on token usage.
 */
function calculateContextPercentage(tokensTotal: number, model: string): number {
  const contextWindow = getModelContextWindow(model);
  const percentage = (tokensTotal / contextWindow) * 100;
  return Math.min(percentage, 100);
}

/**
 * Get session preview with message history.
 *
 * @param sessionKey - The session key (e.g., 'agent:main')
 * @param limit - Maximum number of messages to return
 * @returns Session metadata and message history
 */
export async function getSessionPreview(
  sessionKey: string,
  limit?: number
): Promise<SessionPreview> {
  type PreviewResponse = {
    ts: number;
    previews: Array<{
      key: string;
      status: 'ok' | 'empty' | 'missing' | 'error';
      items: Array<{ role: string; text: string; model?: string }>;
    }>;
  };

  // Always fetch session list from CLI-backed API (works without WebSocket)
  const sessionsListResponse = await fetchSessionsFromApi({ limit: 100 });
  const sessionData = sessionsListResponse.sessions?.find((s) => s.id === sessionKey);

  if (!sessionData) {
    throw new Error(`Session "${sessionKey}" not found`);
  }

  // Try to fetch message history via RPC, but gracefully fallback if unavailable
  let messages: SessionPreview['messages'] = [];
  let effectiveModel = sessionData.model || 'unknown';

  try {
    const previewResponse = await openclawRpc<PreviewResponse>('sessions.preview', {
      keys: [sessionKey],
      limit: limit || 50,
    });

    const previewEntry = previewResponse.previews?.[0];

    if (previewEntry && previewEntry.status === 'ok' && previewEntry.items.length > 0) {
      // Transform items into SessionMessage format
      messages = previewEntry.items.map((item, index) => {
        const role: 'user' | 'assistant' | 'system' =
          item.role === 'user' || item.role === 'assistant' || item.role === 'system'
            ? item.role
            : 'assistant';
        return {
          id: `${sessionKey}-msg-${index}`,
          role,
          content: item.text,
          timestamp: new Date().toISOString(),
        };
      });

      // Use model from preview if available
      const previewModel = previewEntry.items.find((i) => i.model)?.model;
      if (previewModel) {
        effectiveModel = previewModel;
      }
    }
  } catch (_error) {
    // RPC failed (e.g., 502 when WebSocket disconnected) - return session without messages
    // This prevents console flood and allows the UI to show session metadata
    console.warn(`[getSessionPreview] RPC unavailable, returning session without messages: ${sessionKey}`);
  }

  // Get token counts from the CLI-backed session data
  const tokensTotal = sessionData.tokens?.total || 0;
  const tokensInput = sessionData.tokens?.input || 0;
  const tokensOutput = sessionData.tokens?.output || 0;

  // Calculate context percentage
  const contextPercentage =
    effectiveModel !== 'unknown'
      ? calculateContextPercentage(tokensTotal, effectiveModel)
      : 0;

  const session: Session = {
    id: sessionKey,
    name: sessionKey.split(':').pop() || sessionKey,
    type: sessionData.type || 'main',
    model: effectiveModel,
    status: sessionData.status || 'idle',
    createdAt: sessionData.createdAt || new Date().toISOString(),
    updatedAt: sessionData.updatedAt || new Date().toISOString(),
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
 * Reset a session (clear all conversation history).
 * 
 * @param sessionKey - The session key to reset
 */
export async function resetSession(sessionKey: string): Promise<void> {
  await openclawRpc<void>('sessions.reset', { sessionKey });
}

/**
 * Compact a session (summarize context to reduce token usage).
 * 
 * @param sessionKey - The session key to compact
 */
export async function compactSession(sessionKey: string): Promise<void> {
  await openclawRpc<void>('sessions.compact', { sessionKey });
}

/**
 * Cancel/abort a running session.
 * 
 * @param sessionKey - The session key to abort
 */
export async function abortSession(sessionKey: string): Promise<void> {
  await openclawRpc<void>('chat.abort', { sessionKey });
}

// Alias for backward compatibility
export { abortSession as cancelSession };

// ============================================================================
// Chat Operations
// ============================================================================

export interface ChatSendResult {
  runId: string;
  status: 'started' | 'queued' | 'error';
}

/**
 * Send a chat message to a session.
 * 
 * @param sessionKey - The target session key (e.g., 'agent:main', 'trap:myproject:chat123')
 * @param message - The message content
 * @returns Promise with runId and status
 */
export async function sendChatMessage(
  sessionKey: string,
  message: string
): Promise<ChatSendResult> {
  const idempotencyKey = generateUUID();

  const result = await openclawRpc<ChatSendResult>('chat.send', {
    sessionKey,
    message,
    idempotencyKey
  });

  return result;
}

/** Generate UUID for idempotency keys */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
