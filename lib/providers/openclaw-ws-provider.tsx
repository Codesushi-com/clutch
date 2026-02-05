'use client';

/**
 * OpenClaw WebSocket Provider
 * Single shared connection to OpenClaw with pub/sub pattern for chat and RPC
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

// Fallback for non-secure contexts where crypto.randomUUID isn't available
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

// Dynamic WebSocket URL based on page protocol
function getWebSocketUrl(): string {
  if (typeof window === 'undefined') return '';
  
  if (window.location.protocol === 'https:') {
    return `wss://${window.location.host}/openclaw-ws`;
  }
  
  return process.env.NEXT_PUBLIC_OPENCLAW_WS_URL || '';
}

const AUTH_TOKEN = process.env.NEXT_PUBLIC_OPENCLAW_TOKEN || '';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string }>;
  timestamp?: number;
};

type ChatResponse = {
  runId: string;
  sessionKey: string;
  seq: number;
  state: 'started' | 'delta' | 'final' | 'error';
  delta?: string;
  message?: ChatMessage;
  errorMessage?: string;
};

type EventCallback = (data: unknown) => void;
type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

interface OpenClawWSContextValue {
  status: ConnectionStatus;
  rpc: <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
  subscribe: (event: string, callback: EventCallback) => () => void;
  sendChatMessage: (message: string, sessionKey?: string, trapChatId?: string) => Promise<string>;
  isSending: boolean;
}

const OpenClawWSContext = createContext<OpenClawWSContextValue | null>(null);

interface OpenClawWSProviderProps {
  children: React.ReactNode;
}

export function OpenClawWSProvider({ children }: OpenClawWSProviderProps) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isSending, setIsSending] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const connectingRef = useRef(false);
  const reconnectAttempts = useRef(0);
  const connectRef = useRef<(() => void) | null>(null);
  
  // Store pending RPC requests
  const pendingRequests = useRef<Map<string, PendingRequest>>(new Map());
  
  // Store event subscribers
  const eventSubscribers = useRef<Map<string, Set<EventCallback>>>(new Map());
  
  // Track active chat runs
  const activeRunId = useRef<string | null>(null);

  // Clear all pending requests with an error
  const clearPendingRequests = useCallback((errorMessage: string) => {
    const error = new Error(errorMessage);
    pendingRequests.current.forEach((req) => {
      clearTimeout(req.timeout);
      req.reject(error);
    });
    pendingRequests.current.clear();
  }, []);

  // Emit event to subscribers
  const emitEvent = useCallback((event: string, data: unknown) => {
    const subscribers = eventSubscribers.current.get(event);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[OpenClawWS] Error in event callback for ${event}:`, error);
        }
      });
    }
  }, []);
  
  // Clean up active chat state (used when aborting)
  const cleanupActiveChatState = useCallback((sessionKey?: string) => {
    if (activeRunId.current) {
      console.log('[OpenClawWS] Cleaning up active chat state for runId:', activeRunId.current);
      emitEvent('chat.typing.end', { sessionKey });
      activeRunId.current = null;
      if (mountedRef.current) setIsSending(false);
    }
  }, [emitEvent]);

  // Connect to OpenClaw WebSocket
  const connect = useCallback(() => {
    const wsUrl = getWebSocketUrl();
    if (!wsUrl) {
      console.log('[OpenClawWS] No URL configured');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (connectingRef.current) {
      return;
    }

    connectingRef.current = true;
    setStatus(reconnectAttempts.current > 0 ? 'reconnecting' : 'connecting');
    
    console.log('[OpenClawWS] Connecting to', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[OpenClawWS] WebSocket open, sending connect handshake');
      const connectId = generateUUID();
      
      const timeout = setTimeout(() => {
        if (pendingRequests.current.has(connectId)) {
          pendingRequests.current.delete(connectId);
          ws.close();
          connectingRef.current = false;
        }
      }, 10000);
      
      pendingRequests.current.set(connectId, {
        resolve: () => {
          console.log('[OpenClawWS] Connected and authenticated');
          if (mountedRef.current) {
            setStatus('connected');
            reconnectAttempts.current = 0;
          }
          connectingRef.current = false;
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        },
        reject: (e) => {
          console.error('[OpenClawWS] Connect handshake failed:', e);
          connectingRef.current = false;
          ws.close();
        },
        timeout,
      });
      
      ws.send(JSON.stringify({
        type: 'req',
        id: connectId,
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'webchat',
            version: '1.0.0',
            platform: 'web',
            mode: 'webchat',
          },
          auth: {
            token: AUTH_TOKEN
          }
        }
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle RPC responses (type: "res")
        if (data.type === 'res' && data.id && pendingRequests.current.has(data.id)) {
          const pending = pendingRequests.current.get(data.id)!;
          pendingRequests.current.delete(data.id);
          clearTimeout(pending.timeout);
          
          if (!data.ok || data.error) {
            const errorMessage = data.error?.message || 'RPC error';
            pending.reject(new Error(errorMessage));
          } else {
            pending.resolve(data.payload);
          }
          return;
        }

        // Handle events (type: "event")
        if (data.type === 'event') {
          // Only log details for chat events (health, pong, etc. are noisy)
          if (data.event === 'chat') {
            console.log('[OpenClawWS] Received chat event, state:', data.payload?.state, 'runId:', data.payload?.runId);
          }
          
          // Handle chat events specially
          if (data.event === 'chat') {
            const payload = data.payload as ChatResponse;
            
            if (payload.state === 'started') {
              activeRunId.current = payload.runId;
              setIsSending(true);
              emitEvent('chat.typing.start', { runId: payload.runId, sessionKey: payload.sessionKey });
            } else if (payload.state === 'delta') {
              const text = typeof payload.message?.content === 'string' 
                ? payload.message.content 
                : payload.message?.content?.[0]?.text || '';
              emitEvent('chat.delta', { delta: text, runId: payload.runId, sessionKey: payload.sessionKey });
            } else if (payload.state === 'final') {
              emitEvent('chat.typing.end', { sessionKey: payload.sessionKey });
              if (payload.message) {
                emitEvent('chat.message', { message: payload.message, runId: payload.runId, sessionKey: payload.sessionKey });
              }
              if (activeRunId.current === payload.runId) {
                activeRunId.current = null;
                if (mountedRef.current) setIsSending(false);
              }
            } else if (payload.state === 'error') {
              emitEvent('chat.typing.end', { sessionKey: payload.sessionKey });
              emitEvent('chat.error', { error: payload.errorMessage || 'Unknown error', runId: payload.runId, sessionKey: payload.sessionKey });
              if (activeRunId.current === payload.runId) {
                activeRunId.current = null;
                if (mountedRef.current) setIsSending(false);
              }
            }
          }
          
          // Emit generic event for other subscribers
          emitEvent(data.event, data.payload);
        }
      } catch (e) {
        console.error('[OpenClawWS] Failed to parse message:', e);
      }
    };

    ws.onclose = (event) => {
      console.log('[OpenClawWS] Disconnected', event.code, event.reason);
      if (mountedRef.current) {
        setStatus('disconnected');
      }
      connectingRef.current = false;
      
      clearPendingRequests('WebSocket disconnected');
      
      // Only reconnect for network errors, not for endpoint not found errors
      if (mountedRef.current && event.code !== 1006 && event.code !== 1002) {
        reconnectAttempts.current++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current - 1), 30000);
        console.log(`[OpenClawWS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
        reconnectTimeoutRef.current = setTimeout(() => {
          // Use ref to avoid circular dependency
          if (mountedRef.current && connectRef.current) {
            connectRef.current();
          }
        }, delay);
      } else {
        console.log('[OpenClawWS] WebSocket endpoint not available, falling back to HTTP API');
      }
    };

    ws.onerror = (error) => {
      console.error('[OpenClawWS] WebSocket error:', error);
      connectingRef.current = false;
    };
  }, [clearPendingRequests, emitEvent]);

  // Store connect in ref to avoid circular dependency
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    clearPendingRequests('Disconnected by user');
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setStatus('disconnected');
    connectingRef.current = false;
    reconnectAttempts.current = 0;
  }, [clearPendingRequests]);

  // HTTP fallback for when WebSocket is not available
  const httpFallback = useCallback(async <T,>(method: string, params?: Record<string, unknown>): Promise<T> => {
    console.log('[OpenClawWS] Using HTTP fallback for method:', method, 'with params:', params);
    
    // Use OpenClaw's HTTP RPC endpoint for direct API calls
    const openclawUrl = process.env.NEXT_PUBLIC_OPENCLAW_HTTP_URL || 'http://127.0.0.1:4440';
    const openclawToken = process.env.NEXT_PUBLIC_OPENCLAW_TOKEN || AUTH_TOKEN;
    
    const rpcRequest = {
      type: 'req',
      id: generateUUID(),
      method,
      params: params || {}
    };
    
    try {
      const response = await fetch(`${openclawUrl}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': openclawToken ? `Bearer ${openclawToken}` : ''
        },
        body: JSON.stringify(rpcRequest)
      });
      
      if (!response.ok) {
        throw new Error(`OpenClaw HTTP ${response.status}: ${response.statusText}`);
      }
      
      const rpcResponse = await response.json();
      
      if (!rpcResponse.ok || rpcResponse.error) {
        throw new Error(rpcResponse.error?.message || 'OpenClaw RPC error');
      }
      
      return rpcResponse.payload as T;
    } catch (error) {
      console.error('[OpenClawWS] HTTP fallback failed:', error);
      
      // For specific methods, try app-specific API endpoints as final fallback
      if (method === 'chat.abort') {
        const response = await fetch('/api/chat/abort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params || {}),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json() as Promise<T>;
      }
      
      throw error;
    }
  }, []);

  // Generic RPC request method
  const rpc = useCallback(async <T,>(method: string, params?: Record<string, unknown>): Promise<T> => {
    // Handle chat.abort specially to clean up state
    if (method === 'chat.abort') {
      const sessionKey = params?.sessionKey as string | undefined;
      
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        // Use HTTP fallback for abort
        console.warn('[OpenClawWS] WebSocket not connected, using HTTP fallback for chat.abort');
        try {
          const result = await httpFallback<T>(method, params);
          cleanupActiveChatState(sessionKey);
          return result;
        } catch (error) {
          // Even if HTTP fallback fails, clean up local state
          cleanupActiveChatState(sessionKey);
          throw error;
        }
      }

      // WebSocket abort
      const id = generateUUID();
      
      return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (pendingRequests.current.has(id)) {
            pendingRequests.current.delete(id);
            cleanupActiveChatState(sessionKey);
            reject(new Error(`RPC timeout for method: ${method}`));
          }
        }, 60000);
        
        pendingRequests.current.set(id, {
          resolve: (value) => {
            cleanupActiveChatState(sessionKey);
            resolve(value as T);
          },
          reject: (error) => {
            cleanupActiveChatState(sessionKey);
            reject(error);
          },
          timeout,
        });
        
        try {
          wsRef.current!.send(JSON.stringify({
            type: 'req',
            id,
            method,
            params: params || {},
          }));
        } catch (error) {
          pendingRequests.current.delete(id);
          clearTimeout(timeout);
          cleanupActiveChatState(sessionKey);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    }

    // Regular RPC for other methods
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      // Try HTTP fallback instead of throwing error
      console.warn('[OpenClawWS] WebSocket not connected, attempting HTTP fallback');
      return httpFallback<T>(method, params);
    }

    const id = generateUUID();
    
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (pendingRequests.current.has(id)) {
          pendingRequests.current.delete(id);
          reject(new Error(`RPC timeout for method: ${method}`));
        }
      }, 60000);
      
      pendingRequests.current.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
      
      try {
        wsRef.current!.send(JSON.stringify({
          type: 'req',
          id,
          method,
          params: params || {},
        }));
      } catch (error) {
        pendingRequests.current.delete(id);
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }, [cleanupActiveChatState, httpFallback]);

  // Subscribe to events
  const subscribe = useCallback((event: string, callback: EventCallback): (() => void) => {
    if (!eventSubscribers.current.has(event)) {
      eventSubscribers.current.set(event, new Set());
    }
    
    const subscribers = eventSubscribers.current.get(event)!;
    subscribers.add(callback);
    
    // Return unsubscribe function
    return () => {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        eventSubscribers.current.delete(event);
      }
    };
  }, []);

  // Send chat message
  const sendChatMessage = useCallback(async (message: string, sessionKey = 'main', trapChatId?: string): Promise<string> => {
    if (status !== 'connected') {
      throw new Error('Not connected to OpenClaw');
    }

    setIsSending(true);
    const idempotencyKey = generateUUID();
    
    const contextMessage = trapChatId 
      ? `[Trap Chat ID: ${trapChatId}]\n\n${message}`
      : message;

    try {
      const result = await rpc<{ runId: string; status: string }>('chat.send', {
        sessionKey,
        message: contextMessage,
        idempotencyKey,
      });
      
      console.log('[OpenClawWS] chat.send RPC result:', result);
      if (result.status === 'started') {
        activeRunId.current = result.runId;
        console.log('[OpenClawWS] Emitting chat.typing.start with runId:', result.runId);
        emitEvent('chat.typing.start', result.runId);
      }
      
      return result.runId;
    } catch (error) {
      setIsSending(false);
      throw error;
    }
  }, [status, rpc, emitEvent]);

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    connect();
    
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [connect, disconnect]);

  const value: OpenClawWSContextValue = {
    status,
    rpc,
    subscribe,
    sendChatMessage,
    isSending,
  };

  return (
    <OpenClawWSContext.Provider value={value}>
      {children}
    </OpenClawWSContext.Provider>
  );
}

export function useOpenClawWS() {
  const context = useContext(OpenClawWSContext);
  if (!context) {
    throw new Error('useOpenClawWS must be used within an OpenClawWSProvider');
  }
  return context;
}