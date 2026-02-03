import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

export interface Session {
  sessionKey: string;
  agentId: string | null;
  model: string | null;
  kind: string;
  label: string | null;
  status: 'active' | 'idle' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
  
  // Token tracking
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number | null;
  
  // Current activity
  currentMessage: string | null;
  isThinking: boolean;
  
  // Metadata
  spawnedBy: string | null;
  lastActivity: Date | null;
}

export interface SessionEvent {
  type: 'session.created' | 'session.updated' | 'session.deleted' | 'session.activity';
  sessionKey: string;
  session?: Session;
  activity?: {
    message: string;
    thinking: boolean;
    timestamp: Date;
  };
}

export interface SessionState {
  sessions: Map<string, Session>;
  isLoading: boolean;
  lastUpdate: Date | null;
  
  // Batch update management
  pendingUpdates: Map<string, Partial<Session>>;
  updateTimeout: NodeJS.Timeout | null;
  
  // Actions
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  updateSession: (sessionKey: string, updates: Partial<Session>) => void;
  removeSession: (sessionKey: string) => void;
  handleEvent: (event: SessionEvent) => void;
  setLoading: (loading: boolean) => void;
  
  // Batched updates to prevent render storms
  batchUpdateSession: (sessionKey: string, updates: Partial<Session>) => void;
  flushPendingUpdates: () => void;
  
  // Selectors
  getActiveSessions: () => Session[];
  getSessionsByModel: (model: string) => Session[];
  getTotalTokenUsage: () => { input: number; output: number; total: number; cost: number };
}

export const useSessionStore = create<SessionState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // Initial state
      sessions: new Map(),
      isLoading: false,
      lastUpdate: null,
      pendingUpdates: new Map(),
      updateTimeout: null,
      
      // Actions
      setSessions: (sessions: Session[]) => {
        const sessionMap = new Map();
        sessions.forEach(session => {
          sessionMap.set(session.sessionKey, session);
        });
        set({ 
          sessions: sessionMap, 
          lastUpdate: new Date(),
          isLoading: false 
        });
      },
      
      addSession: (session: Session) => {
        set((state) => ({
          sessions: new Map(state.sessions).set(session.sessionKey, session),
          lastUpdate: new Date()
        }));
      },
      
      updateSession: (sessionKey: string, updates: Partial<Session>) => {
        set((state) => {
          const sessions = new Map(state.sessions);
          const existing = sessions.get(sessionKey);
          if (existing) {
            sessions.set(sessionKey, { 
              ...existing, 
              ...updates, 
              updatedAt: new Date() 
            });
          }
          return {
            sessions,
            lastUpdate: new Date()
          };
        });
      },
      
      removeSession: (sessionKey: string) => {
        set((state) => {
          const sessions = new Map(state.sessions);
          sessions.delete(sessionKey);
          return {
            sessions,
            lastUpdate: new Date()
          };
        });
      },
      
      handleEvent: (event: SessionEvent) => {
        const { type, sessionKey, session, activity } = event;
        
        switch (type) {
          case 'session.created':
            if (session) {
              get().addSession(session);
            }
            break;
            
          case 'session.updated':
            if (session) {
              get().updateSession(sessionKey, session);
            }
            break;
            
          case 'session.deleted':
            get().removeSession(sessionKey);
            break;
            
          case 'session.activity':
            if (activity) {
              get().updateSession(sessionKey, {
                currentMessage: activity.message,
                isThinking: activity.thinking,
                lastActivity: activity.timestamp
              });
            }
            break;
        }
      },
      
      setLoading: (loading: boolean) => set({ isLoading: loading }),
      
      // Batched updates to prevent render storms with high-frequency events
      batchUpdateSession: (sessionKey: string, updates: Partial<Session>) => {
        const state = get();
        
        // Add to pending updates
        const pending = new Map(state.pendingUpdates);
        const existing = pending.get(sessionKey) || {};
        pending.set(sessionKey, { ...existing, ...updates });
        
        // Clear existing timeout
        if (state.updateTimeout) {
          clearTimeout(state.updateTimeout);
        }
        
        // Set new timeout to flush updates
        const timeout = setTimeout(() => {
          get().flushPendingUpdates();
        }, 100); // 100ms batch window
        
        set({ pendingUpdates: pending, updateTimeout: timeout });
      },
      
      flushPendingUpdates: () => {
        const { pendingUpdates, updateTimeout } = get();
        
        if (updateTimeout) {
          clearTimeout(updateTimeout);
        }
        
        // Apply all pending updates
        pendingUpdates.forEach((updates, sessionKey) => {
          get().updateSession(sessionKey, updates);
        });
        
        set({ 
          pendingUpdates: new Map(), 
          updateTimeout: null 
        });
      },
      
      // Selector helpers
      getActiveSessions: () => {
        const sessions = Array.from(get().sessions.values());
        return sessions.filter(s => s.status === 'active');
      },
      
      getSessionsByModel: (model: string) => {
        const sessions = Array.from(get().sessions.values());
        return sessions.filter(s => s.model === model);
      },
      
      getTotalTokenUsage: () => {
        const sessions = Array.from(get().sessions.values());
        return sessions.reduce((acc, session) => ({
          input: acc.input + session.inputTokens,
          output: acc.output + session.outputTokens,
          total: acc.total + session.totalTokens,
          cost: acc.cost + (session.cost || 0)
        }), { input: 0, output: 0, total: 0, cost: 0 });
      }
    })),
    {
      name: 'session-store',
    }
  )
);

// Selector hooks for common use cases
export const useSessions = () => useSessionStore((state) => Array.from(state.sessions.values()));
export const useActiveSessionCount = () => useSessionStore((state) => 
  Array.from(state.sessions.values()).filter(s => s.status === 'active').length
);
export const useSession = (sessionKey: string) => useSessionStore((state) => 
  state.sessions.get(sessionKey)
);
export const useSessionsLoading = () => useSessionStore((state) => state.isLoading);