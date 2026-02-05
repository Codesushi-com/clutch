'use client';

/**
 * WebSocket Provider
 * Manages WebSocket connection to OpenClaw gateway with automatic reconnection
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useSessionStore } from '@/lib/stores/session-store';
import { SessionEvent, WebSocketMessage } from '@/lib/types';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

interface WebSocketContextValue {
  status: ConnectionStatus;
  lastMessage: WebSocketMessage | null;
  sendMessage: (message: unknown) => void;
  reconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

// Dynamic WebSocket URL based on page protocol
// HTTPS pages must use WSS through nginx proxy, HTTP can use WS directly
function getWebSocketUrl(): string {
  if (typeof window === 'undefined') return '';
  
  // When on HTTPS, use the same-origin WSS proxy
  if (window.location.protocol === 'https:') {
    return `wss://${window.location.host}/openclaw-ws`;
  }
  
  // When on HTTP (dev), use direct connection
  return process.env.NEXT_PUBLIC_OPENCLAW_WS_URL || '';
}

const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const PING_INTERVAL = 30000;

interface WebSocketProviderProps {
  children: React.ReactNode;
  url?: string;
}

export function WebSocketProvider({ children, url }: WebSocketProviderProps) {
  // Compute URL on client side only
  const [wsUrl, setWsUrl] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return url || getWebSocketUrl();
  });
  const previousUrlRef = useRef(url);

  // Update URL when prop changes
  useEffect(() => {
    if (typeof window !== 'undefined' && url !== previousUrlRef.current) {
      previousUrlRef.current = url;
      const newUrl = url || getWebSocketUrl();
      setTimeout(() => setWsUrl(newUrl), 0);
    }
  }, [url]);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const connectRef = useRef<(() => void) | null>(null);
  const handleWebSocketEvent = useSessionStore((state) => state.handleWebSocketEvent);

  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    // Skip connection if no URL configured
    if (!wsUrl) {
      console.log('[WebSocket] No URL configured, skipping connection');
      setStatus('disconnected');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus((prev) => (prev === 'disconnected' ? 'connecting' : 'reconnecting'));
    console.log('[WebSocket] Connecting to', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        setStatus('connected');
        reconnectAttemptsRef.current = 0;
        
        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          setLastMessage(message);

          // Handle session events
          if (
            message.type === 'session.started' ||
            message.type === 'session.updated' ||
            message.type === 'session.completed' ||
            message.type === 'session.cancelled'
          ) {
            handleWebSocketEvent(message as SessionEvent);
          }
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Closed:', event.code, event.reason);
        setStatus('disconnected');
        clearTimers();

        // Attempt to reconnect unless it was a clean close
        if (!event.wasClean) {
          const delay = Math.min(
            RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current),
            MAX_RECONNECT_DELAY
          );
          reconnectAttemptsRef.current++;
          
          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectRef.current?.();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        setStatus('disconnected');
      };
    } catch (err) {
      console.error('[WebSocket] Failed to connect:', err);
      setStatus('disconnected');
    }
  }, [wsUrl, handleWebSocketEvent, clearTimers]);

  // Store connect function in ref for access in onclose handler
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [clearTimers]);

  const sendMessage = useCallback((message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Cannot send message, not connected');
    }
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [disconnect, connect]);

  // Connect on mount
  useEffect(() => {
    // Use timeout to avoid synchronous setState in effect
    const timer = setTimeout(() => connect(), 0);
    return () => {
      clearTimeout(timer);
      disconnect();
    };
  }, [connect, disconnect]);

  const value: WebSocketContextValue = {
    status,
    lastMessage,
    sendMessage,
    reconnect,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

export function useConnectionStatus() {
  const { status } = useWebSocket();
  return status;
}
