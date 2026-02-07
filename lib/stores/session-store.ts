/**
 * Session Store
 * Zustand store for managing session state with real-time updates
 *
 * This is the SINGLE SOURCE OF TRUTH for session data fetched from OpenClaw.
 * All components should read from this store instead of making independent fetches.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  Session,
  SessionStatus,
  SessionType,
} from '@/lib/types';
import * as openclawApi from '@/lib/openclaw/api';

export interface SessionFilters {
  status?: SessionStatus;
  type?: SessionType;
  model?: string;
}

interface SessionState {
  // Data
  sessions: Session[];

  // Loading states
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  lastFetchedAt: number | null;

  // Filters
  filters: SessionFilters;
  sortBy: 'createdAt' | 'updatedAt' | 'tokens';
  sortOrder: 'asc' | 'desc';

  // Actions
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  updateSession: (id: string, changes: Partial<Session>) => void;
  removeSession: (id: string) => void;

  // Loading actions
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  setError: (error: string | null) => void;

  // Filter actions
  setFilters: (filters: SessionFilters) => void;
  setSortBy: (sortBy: SessionState['sortBy']) => void;
  setSortOrder: (order: SessionState['sortOrder']) => void;

  // Fetch action - SINGLE SOURCE OF TRUTH for session fetching
  fetchAndUpdate: (isInitialLoad?: boolean) => Promise<void>;

  // Computed
  getFilteredSessions: () => Session[];
  getSessionById: (id: string) => Session | undefined;
}

export const useSessionStore = create<SessionState>()(
  devtools(
    (set, get) => ({
      // Initial state
      // NOTE: isLoading starts as false to prevent stuck skeleton on initial mount.
      // The component will set isLoading to true when it starts fetching.
      sessions: [],
      isLoading: false,
      isInitialized: false,
      error: null,
      lastFetchedAt: null,
      filters: {},
      sortBy: 'updatedAt',
      sortOrder: 'desc',

      // Data actions
      setSessions: (sessions) => set({ sessions, isLoading: false }),
      
      addSession: (session) =>
        set((state) => ({
          sessions: [session, ...state.sessions],
        })),
      
      updateSession: (id, changes) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, ...changes, updatedAt: new Date().toISOString() } : s
          ),
        })),
      
      removeSession: (id) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
        })),

      // Loading actions
      setLoading: (isLoading) => set({ isLoading }),
      setInitialized: (isInitialized) => set({ isInitialized }),
      setError: (error) => set({ error, isLoading: false }),

      // Fetch action - SINGLE SOURCE OF TRUTH
      // This is the ONLY place that should call the sessions API
      fetchAndUpdate: async (isInitialLoad = false) => {
        if (isInitialLoad) {
          set({ isLoading: true });
        }

        try {
          const response = await openclawApi.listSessionsWithEffectiveModel({ limit: 100 });
          set({
            sessions: response.sessions,
            lastFetchedAt: Date.now(),
            error: null,
            ...(isInitialLoad ? { isInitialized: true, isLoading: false } : {}),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to load sessions';
          set({
            error: message,
            ...(isInitialLoad ? { isLoading: false } : {}),
          });
        }
      },

      // Filter actions
      setFilters: (filters) => set({ filters }),
      setSortBy: (sortBy) => set({ sortBy }),
      setSortOrder: (sortOrder) => set({ sortOrder }),

      // Computed
      getFilteredSessions: () => {
        const { sessions, filters, sortBy, sortOrder } = get();
        
        let filtered = sessions;
        
        if (filters.status) {
          filtered = filtered.filter((s) => s.status === filters.status);
        }
        
        if (filters.type) {
          filtered = filtered.filter((s) => s.type === filters.type);
        }
        
        if (filters.model) {
          filtered = filtered.filter((s) => 
            s.model.toLowerCase().includes(filters.model!.toLowerCase())
          );
        }

        // Sort
        filtered = [...filtered].sort((a, b) => {
          let comparison = 0;
          
          switch (sortBy) {
            case 'createdAt':
              comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
              break;
            case 'updatedAt':
              comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
              break;
            case 'tokens':
              comparison = a.tokens.total - b.tokens.total;
              break;
          }
          
          return sortOrder === 'asc' ? comparison : -comparison;
        });

        return filtered;
      },

      getSessionById: (id) => {
        return get().sessions.find((s) => s.id === id);
      },
    }),
    { name: 'session-store' }
  )
);
