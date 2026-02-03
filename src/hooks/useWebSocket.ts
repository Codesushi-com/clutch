import { useState, useEffect, useRef, useCallback } from 'react';

export interface WebSocketState {
  status: 'connected' | 'disconnected' | 'reconnecting';
  reconnectAttempt: number;
  url: string;
  uptime: number;
  lastError: string | null;
}

export interface UseWebSocketOptions {
  url: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const {
    url,
    reconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10
  } = options;

  const [state, setState] = useState<WebSocketState>({
    status: 'disconnected',
    reconnectAttempt: 0,
    url,
    uptime: 0,
    lastError: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectTimeRef = useRef<number | null>(null);
  const uptimeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startUptimeTracking = useCallback(() => {
    connectTimeRef.current = Date.now();
    
    uptimeIntervalRef.current = setInterval(() => {
      if (connectTimeRef.current && state.status === 'connected') {
        setState(prevState => ({
          ...prevState,
          uptime: Date.now() - connectTimeRef.current!
        }));
      }
    }, 1000);
  }, [state.status]);

  const stopUptimeTracking = useCallback(() => {
    if (uptimeIntervalRef.current) {
      clearInterval(uptimeIntervalRef.current);
      uptimeIntervalRef.current = null;
    }
    connectTimeRef.current = null;
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        setState(prevState => ({
          ...prevState,
          status: 'connected',
          reconnectAttempt: 0,
          lastError: null
        }));
        startUptimeTracking();
      };

      wsRef.current.onclose = () => {
        stopUptimeTracking();
        setState(prevState => ({
          ...prevState,
          status: 'disconnected',
          uptime: 0
        }));

        if (reconnect) {
          setState(prevState => {
            if (prevState.reconnectAttempt < maxReconnectAttempts) {
              const newState = {
                ...prevState,
                status: 'reconnecting' as const,
                reconnectAttempt: prevState.reconnectAttempt + 1
              };

              reconnectTimeoutRef.current = setTimeout(() => {
                connect();
              }, reconnectInterval);

              return newState;
            }
            return prevState;
          });
        }
      };

      wsRef.current.onerror = (error) => {
        setState(prevState => ({
          ...prevState,
          lastError: `Connection failed: ${error.type}`,
          status: 'disconnected'
        }));
        stopUptimeTracking();
      };

    } catch (error) {
      setState(prevState => ({
        ...prevState,
        lastError: `Failed to create connection: ${error}`,
        status: 'disconnected'
      }));
    }
  }, [url, reconnect, reconnectInterval, maxReconnectAttempts, startUptimeTracking, stopUptimeTracking]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    stopUptimeTracking();
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setState(prevState => ({
      ...prevState,
      status: 'disconnected',
      reconnectAttempt: 0,
      uptime: 0
    }));
  }, [stopUptimeTracking]);

  useEffect(() => {
    // Initial connection
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      connect();
    }
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      stopUptimeTracking();
      
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (uptimeIntervalRef.current) {
        clearInterval(uptimeIntervalRef.current);
      }
    };
  }, []);

  return {
    state,
    connect,
    disconnect,
    websocket: wsRef.current
  };
}