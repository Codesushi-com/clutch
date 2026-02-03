// Store exports
export * from './connection-store';
export * from './session-store';
export * from './cron-store';

// Re-export commonly used hooks for convenience
export {
  useConnectionStore,
  useConnectionStatus,
  useIsConnected,
  useConnectionError,
} from './connection-store';

export {
  useSessionStore,
  useSessions,
  useActiveSessionCount,
  useSession,
  useSessionsLoading,
} from './session-store';

export {
  useCronStore,
  useCronJobs,
  useEnabledCronJobs,
  useRunningCronJobs,
  useCronJob,
  useCronJobRuns,
  useCronLoading,
} from './cron-store';

// Types export
export type { ConnectionState } from './connection-store';
export type { Session, SessionEvent, SessionState } from './session-store';
export type { CronJob, CronRun, CronEvent, CronState, CronSchedule, CronPayload } from './cron-store';

// Store instances for direct access (when needed outside React components)
import { useConnectionStore } from './connection-store';
import { useSessionStore } from './session-store';
import { useCronStore } from './cron-store';

export const stores = {
  connection: useConnectionStore,
  session: useSessionStore,
  cron: useCronStore,
};

// Event subscription helper for WebSocket integration
export interface StoreEventSubscriber {
  subscribeToEvents: (ws: WebSocket) => () => void; // Returns unsubscribe function
}

export const createEventSubscriber = (): StoreEventSubscriber => {
  return {
    subscribeToEvents: (ws: WebSocket) => {
      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          
          // Route events to appropriate stores based on event type
          if (data.type?.startsWith('session.')) {
            useSessionStore.getState().handleEvent(data);
          } else if (data.type?.startsWith('job.') || data.type?.startsWith('run.')) {
            useCronStore.getState().handleEvent(data);
          } else if (data.type?.startsWith('connection.')) {
            // Handle connection-specific events if needed
            console.log('Connection event:', data);
          }
          
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      const handleError = (error: Event) => {
        useConnectionStore.getState().setError('WebSocket error occurred');
        console.error('WebSocket error:', error);
      };
      
      // Subscribe to WebSocket events
      ws.addEventListener('message', handleMessage);
      ws.addEventListener('error', handleError);
      
      // Return unsubscribe function
      return () => {
        ws.removeEventListener('message', handleMessage);
        ws.removeEventListener('error', handleError);
      };
    }
  };
};

// Helper to initialize stores with WebSocket connection
export const initializeStores = (gatewayUrl: string) => {
  const connectionStore = useConnectionStore.getState();
  const eventSubscriber = createEventSubscriber();
  
  // Connect to gateway
  connectionStore.connect(gatewayUrl);
  
  // Set up event subscription when connected
  const unsubscribeFromConnection = useConnectionStore.subscribe(
    (state) => state.ws,
    (ws, prevWs) => {
      // Clean up previous subscription
      if (prevWs && (prevWs as any)._unsubscribeEvents) {
        (prevWs as any)._unsubscribeEvents();
      }
      
      // Set up new subscription
      if (ws) {
        const unsubscribeEvents = eventSubscriber.subscribeToEvents(ws);
        (ws as any)._unsubscribeEvents = unsubscribeEvents;
      }
    }
  );
  
  // Return cleanup function
  return () => {
    unsubscribeFromConnection();
    connectionStore.disconnect();
  };
};