/**
 * OpenClaw HTTP RPC Client
 * 
 * Standalone HTTP client for OpenClaw gateway RPC calls.
 * Works in both client and server contexts (React-agnostic).
 * 
 * Usage:
 *   import { openclawRpc, sendChatMessage, listSessions } from '@/lib/openclaw';
 *   
 *   // Generic RPC call
 *   const result = await openclawRpc<SomeType>('method.name', { param: 'value' });
 *   
 *   // Typed helpers
 *   const sessions = await listSessions({ limit: 10 });
 *   const { runId } = await sendChatMessage('agent:main', 'Hello');
 */

import { generateUUID } from '@/lib/utils/uuid';

// ============================================================================
// Configuration
// ============================================================================

/** Get the OpenClaw gateway host */
function getOpenClawHost(): string {
  // Server-side: use env var
  if (typeof process !== 'undefined' && process.env?.OPENCLAW_HOST) {
    return process.env.OPENCLAW_HOST;
  }
  
  // Client-side: derive from window.location
  if (typeof window !== 'undefined') {
    return window.location.hostname;
  }
  
  // Fallback
  return '127.0.0.1';
}

/** Get the OpenClaw gateway port */
function getOpenClawPort(): string {
  if (typeof process !== 'undefined' && process.env?.OPENCLAW_PORT) {
    return process.env.OPENCLAW_PORT;
  }
  return '18789';
}

/** Get the OpenClaw HTTP RPC URL */
function getOpenClawUrl(): string {
  // Allow full override
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_OPENCLAW_HTTP_URL) {
    return process.env.NEXT_PUBLIC_OPENCLAW_HTTP_URL;
  }
  
  // Client-side: proxy through Next.js to avoid CORS
  if (typeof window !== 'undefined') {
    return '';  // Use relative URL — /api/openclaw/rpc
  }

  const host = getOpenClawHost();
  const port = getOpenClawPort();
  return `http://${host}:${port}`;
}

/** Get the auth token */
function getAuthToken(): string {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_OPENCLAW_TOKEN) {
    return process.env.NEXT_PUBLIC_OPENCLAW_TOKEN;
  }
  return '';
}

// ============================================================================
// Types
// ============================================================================

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
    code?: number;
    message: string;
    data?: unknown;
  };
}

// ============================================================================
// Core RPC
// ============================================================================

/**
 * Make a raw HTTP RPC call to OpenClaw gateway.
 * 
 * @param method - The RPC method name (e.g., 'sessions.list', 'chat.send')
 * @param params - Method parameters
 * @returns Promise with the response payload
 * @throws Error if the request fails or returns an RPC error
 * 
 * @example
 * const sessions = await openclawRpc<Array<Session>>('sessions.list', { limit: 10 });
 */
// Track consecutive failures to implement backoff
let _consecutiveFailures = 0;
const _MAX_BACKOFF_FAILURES = 3;

export async function openclawRpc<T = unknown>(
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  // If we've failed too many times in a row, skip calls silently
  // to avoid flooding the console. Reset after 60s.
  if (_consecutiveFailures >= _MAX_BACKOFF_FAILURES) {
    throw new Error('OpenClaw RPC unavailable (backing off)');
  }

  const baseUrl = getOpenClawUrl();
  const url = baseUrl ? `${baseUrl}/rpc` : '/api/openclaw/rpc';
  const token = getAuthToken();

  const request: RpcRequest = {
    type: 'req',
    id: generateUUID(),
    method,
    params: params || {}
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      _consecutiveFailures++;
      if (_consecutiveFailures === _MAX_BACKOFF_FAILURES) {
        console.warn('[OpenClaw RPC] Unavailable — suppressing further attempts for 60s');
        setTimeout(() => { _consecutiveFailures = 0; }, 60000);
      }
      throw new Error(`OpenClaw HTTP ${response.status}: ${response.statusText}`);
    }

    const rpcResponse: RpcResponse<T> = await response.json();

    if (!rpcResponse.ok || rpcResponse.error) {
      throw new Error(rpcResponse.error?.message || 'OpenClaw RPC error');
    }

    // Success — reset failure counter
    _consecutiveFailures = 0;
    return rpcResponse.payload as T;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('OpenClaw')) {
      throw error; // Re-throw our own errors
    }
    _consecutiveFailures++;
    if (_consecutiveFailures === _MAX_BACKOFF_FAILURES) {
      console.warn('[OpenClaw RPC] Unavailable — suppressing further attempts for 60s');
      setTimeout(() => { _consecutiveFailures = 0; }, 60000);
    }
    throw new Error(`OpenClaw RPC error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Check if OpenClaw HTTP API is available.
 * Uses a lightweight config.get call.
 */
export async function isOpenClawAvailable(): Promise<boolean> {
  try {
    await openclawRpc('config.get', {});
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Gateway Status
// ============================================================================

export interface GatewayStatus {
  version: string;
  uptime: number;
  sessions: {
    active: number;
    total: number;
  };
  memory?: {
    backend: string;
  };
}

/**
 * Get OpenClaw gateway status.
 * Returns version, uptime, and session counts.
 */
export async function getGatewayStatus(): Promise<GatewayStatus> {
  // config.get returns the full config; we'll extract relevant info
  const config = await openclawRpc<{
    meta?: { lastTouchedVersion?: string };
  }>('config.get', {});
  
  // Get session counts
  const sessions = await openclawRpc<{
    sessions?: Array<unknown>;
  }>('sessions.list', { limit: 0 });

  return {
    version: config.meta?.lastTouchedVersion || 'unknown',
    uptime: 0, // Not directly available via HTTP RPC
    sessions: {
      active: sessions.sessions?.length || 0,
      total: sessions.sessions?.length || 0
    }
  };
}
