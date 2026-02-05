/**
 * OpenClaw Backend Integration
 * 
 * Provides persistent WebSocket connection from Trap backend to OpenClaw
 * for reliable message handling, deduplication, and SSE broadcasting.
 */

export { 
  getOpenClawClient, 
  initializeOpenClawClient,
  type ChatEvent,
  type ChatMessage,
  type ConnectionStatus
} from './client'
