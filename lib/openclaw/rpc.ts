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
// Exponential backoff state for transient failures.
// After consecutive failures, we suppress calls for an increasing cooldown
// to avoid flooding the console/network with doomed requests.
let _consecutiveFailures = 0;
let _backoffUntil = 0;  // timestamp (ms) — skip calls until this time

/** Calculate backoff delay with exponential increase (cap at 60s) */
function _getBackoffDelay(): number {
  // Exponential backoff: 5s → 10s → 20s → 40s → 60s (cap)
  return Math.min(5 * Math.pow(2, _consecutiveFailures - 1), 60);
}

function _recordFailure(retryAfterSeconds?: number): void {
  _consecutiveFailures++;
  
  // If server sent Retry-After, use that (with a small buffer), otherwise use exponential backoff
  const delaySec = retryAfterSeconds 
    ? retryAfterSeconds + 1  // Add 1s buffer to server's suggestion
    : _getBackoffDelay();
    
  _backoffUntil = Date.now() + delaySec * 1000;
  
  if (_consecutiveFailures <= 3) {
    console.warn(`[OpenClaw RPC] Failure #${_consecutiveFailures} — backing off ${delaySec}s`);
  }
}

function _recordSuccess(): void {
  _consecutiveFailures = 0;
  _backoffUntil = 0;
}

export async function openclawRpc<T = unknown>(
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  // If we're in a backoff window, reject immediately without hitting the network
  if (_backoffUntil > 0 && Date.now() < _backoffUntil) {
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
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      // Check for 503 with Retry-After header (server is temporarily unavailable)
      const retryAfter = response.status === 503 
        ? parseInt(response.headers.get('Retry-After') || '5', 10)
        : undefined;
      
      _recordFailure(retryAfter);
      throw new Error(`OpenClaw HTTP ${response.status}: ${response.statusText}`);
    }

    const rpcResponse: RpcResponse<T> = await response.json();

    if (!rpcResponse.ok || rpcResponse.error) {
      // RPC-level error (method exists but returned error) — don't backoff
      throw new Error(rpcResponse.error?.message || 'OpenClaw RPC error');
    }

    _recordSuccess();
    return rpcResponse.payload as T;
  } catch (error) {
    if (error instanceof Error && error.message.includes('backing off')) {
      throw error;
    }
    // Network / timeout errors trigger backoff
    if (error instanceof Error && !error.message.startsWith('OpenClaw RPC error')) {
      _recordFailure();
    }
    throw error instanceof Error
      ? error
      : new Error(`OpenClaw RPC error: ${String(error)}`);
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
