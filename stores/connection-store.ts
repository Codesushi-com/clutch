import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

export interface ConnectionState {
  // Connection status
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  lastConnected: Date | null;
  lastError: string | null;
  reconnectAttempts: number;
  
  // WebSocket instance
  ws: WebSocket | null;
  
  // Connection info
  gatewayUrl: string;
  
  // Actions
  connect: (url: string) => void;
  disconnect: () => void;
  setStatus: (status: ConnectionState['status']) => void;
  setError: (error: string | null) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
  setWebSocket: (ws: WebSocket | null) => void;
}

export const useConnectionStore = create<ConnectionState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // Initial state
      status: 'disconnected',
      lastConnected: null,
      lastError: null,
      reconnectAttempts: 0,
      ws: null,
      gatewayUrl: '',
      
      // Actions
      connect: (url: string) => {
        const { ws } = get();
        
        // Close existing connection if any
        if (ws) {
          ws.close();
        }
        
        set({ gatewayUrl: url, status: 'connecting', lastError: null });
        
        try {
          const newWs = new WebSocket(url);
          
          newWs.onopen = () => {
            set({ 
              status: 'connected', 
              lastConnected: new Date(),
              lastError: null,
              reconnectAttempts: 0
            });
          };
          
          newWs.onclose = (event) => {
            set({ status: 'disconnected', ws: null });
            
            // Auto-reconnect with exponential backoff if not a manual disconnect
            if (!event.wasClean && get().status !== 'disconnected') {
              const attempts = get().reconnectAttempts;
              const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Cap at 30s
              
              setTimeout(() => {
                if (get().status === 'disconnected') {
                  set({ status: 'reconnecting' });
                  get().connect(url);
                }
              }, delay);
              
              get().incrementReconnectAttempts();
            }
          };
          
          newWs.onerror = () => {
            set({ 
              status: 'disconnected',
              lastError: 'WebSocket connection failed'
            });
          };
          
          set({ ws: newWs });
          
        } catch (error) {
          set({ 
            status: 'disconnected',
            lastError: error instanceof Error ? error.message : 'Connection failed'
          });
        }
      },
      
      disconnect: () => {
        const { ws } = get();
        set({ status: 'disconnected' });
        
        if (ws) {
          ws.close(1000, 'Manual disconnect');
          set({ ws: null });
        }
      },
      
      setStatus: (status) => set({ status }),
      setError: (error) => set({ lastError: error }),
      incrementReconnectAttempts: () => set((state) => ({ 
        reconnectAttempts: state.reconnectAttempts + 1 
      })),
      resetReconnectAttempts: () => set({ reconnectAttempts: 0 }),
      setWebSocket: (ws) => set({ ws }),
    })),
    {
      name: 'connection-store',
    }
  )
);

// Connection status selector helpers
export const useConnectionStatus = () => useConnectionStore((state) => state.status);
export const useIsConnected = () => useConnectionStore((state) => state.status === 'connected');
export const useConnectionError = () => useConnectionStore((state) => state.lastError);