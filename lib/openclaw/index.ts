/**
 * OpenClaw HTTP Client
 * 
 * Standalone HTTP RPC client for OpenClaw gateway.
 * No React dependencies - works in client, server, and API routes.
 * 
 * @example
 * // Basic usage
 * import { sendChatMessage, listSessions } from '@/lib/openclaw';
 * 
 * const sessions = await listSessions({ limit: 10 });
 * const { runId } = await sendChatMessage('agent:main', 'Hello!');
 * 
 * @example
 * // Advanced: raw RPC
 * import { openclawRpc } from '@/lib/openclaw';
 * 
 * const result = await openclawRpc<CustomType>('custom.method', { param: 'value' });
 */

// Core RPC
export {
  openclawRpc,
  isOpenClawAvailable,
  getGatewayStatus,
} from './rpc';

export type {
  RpcRequest,
  RpcResponse,
  GatewayStatus,
} from './rpc';

// High-level API
export {
  // Session management
  listSessions,
  listSessionsWithEffectiveModel,
  getSessionPreview,
  resetSession,
  compactSession,
  abortSession,
  cancelSession,
  patchSession,

  // Chat operations
  sendChatMessage,
} from './api';

export type {
  ChatSendResult,
} from './api';

// Legacy WebSocket client (for server-side use)
// Note: This maintains the persistent WS connection for backend event handling
export {
  getOpenClawClient,
  initializeOpenClawClient,
  type ChatEvent,
  type ChatMessage,
  type ConnectionStatus,
} from './client';
