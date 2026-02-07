/**
 * Session Store
 * Zustand store for managing session state
 *
 * This store is now populated by ConvexSessionSync, which subscribes to
 * Convex reactive queries. No HTTP polling is performed by this store.
 *
 * Components can read from this store (for zustand-based access) or use
 * useAgentSessions hook for direct Convex subscription.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  Session,
  SessionStatus,
  SessionType,
} from '@/lib/types';

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

  /**
   * @deprecated No longer fetches from HTTP. Use ConvexSessionSync component
   * or useAgentSessions hook for reactive session data.
   */
  fetchAndUpdate: (isInitialLoad?: boolean) => Promise<void>;

  // Computed
  getFilteredSessions: () => Session[];
  getSessionById: (id: string) => Session | undefined;
}

export const useSessionStore = create<SessionState>()(
  devtools(
    (set, get) => ({
      // Initial state
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

      /**
       * @deprecated No longer fetches from HTTP. This is now a no-op.
       * ConvexSessionSync component populates the store reactively.
       */
      fetchAndUpdate: async (_isInitialLoad = false) => {
        // No-op: Data comes from Convex via ConvexSessionSync
        console.warn('[session-store] fetchAndUpdate is deprecated. Data comes from Convex reactively.');
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
