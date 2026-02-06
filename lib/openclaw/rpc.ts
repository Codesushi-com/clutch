/**
 * OpenClaw HTTP RPC Client
 * Standalone HTTP client for OpenClaw RPC calls (no React, no WebSocket)
 */

// Fallback UUID generator for non-secure contexts
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

// Get the OpenClaw HTTP URL from environment or default
function getOpenClawUrl(): string {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_OPENCLAW_HTTP_URL) {
    return process.env.NEXT_PUBLIC_OPENCLAW_HTTP_URL;
  }
  // Default to localhost:18789 (standard OpenClaw HTTP port)
  return 'http://127.0.0.1:18789';
}

// Get the auth token from environment
function getAuthToken(): string {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_OPENCLAW_TOKEN) {
    return process.env.NEXT_PUBLIC_OPENCLAW_TOKEN;
  }
  return '';
}

export interface RpcRequest {
  type: 'req';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcResponse<T = unknown> {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: T;
  error?: {
    message: string;
    code?: string;
  };
}

export interface ChatSendResult {
  runId: string;
  status: 'started' | 'queued' | 'error';
}

/**
 * Make an HTTP RPC call to OpenClaw
 * @param method - The RPC method name
 * @param params - Method parameters
 * @returns Promise with the response payload
 */
export async function rpc<T = unknown>(
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  const url = `${getOpenClawUrl()}/rpc`;
  const token = getAuthToken();

  const request: RpcRequest = {
    type: 'req',
    id: generateUUID(),
    method,
    params: params || {}
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`OpenClaw HTTP ${response.status}: ${response.statusText}`);
  }

  const rpcResponse: RpcResponse<T> = await response.json();

  if (!rpcResponse.ok || rpcResponse.error) {
    throw new Error(rpcResponse.error?.message || 'OpenClaw RPC error');
  }

  return rpcResponse.payload as T;
}

/**
 * Send a chat message via HTTP POST to OpenClaw
 * @param message - The message content
 * @param sessionKey - The session key (default: 'main')
 * @param trapChatId - Optional trap chat ID for context
 * @returns Promise with runId and status
 */
export async function sendChatMessage(
  message: string,
  sessionKey = 'main',
  trapChatId?: string
): Promise<ChatSendResult> {
  const idempotencyKey = generateUUID();

  const contextMessage = trapChatId
    ? `[Trap Chat ID: ${trapChatId}]\n\n${message}`
    : message;

  const result = await rpc<ChatSendResult>('chat.send', {
    sessionKey,
    message: contextMessage,
    idempotencyKey
  });

  return result;
}

/**
 * Abort an ongoing chat session
 * @param sessionKey - The session key to abort
 */
export async function abortChat(sessionKey: string): Promise<void> {
  await rpc('chat.abort', { sessionKey });
}

/**
 * Check if OpenClaw HTTP API is available
 * @returns Promise<boolean> indicating if the API is reachable
 */
export async function isOpenClawAvailable(): Promise<boolean> {
  try {
    // Use a lightweight config.get call to check availability
    await rpc('config.get', {});
    return true;
  } catch {
    return false;
  }
}
