/**
 * Session Store
 * Zustand store for managing session state
 *
 * This store is now populated by ConvexSessionSync, which subscribes to
 * the Convex sessions table. No HTTP polling is performed by this store.
 *
 * Components can read from this store (for zustand-based access) or use
 * useSessions hook for direct Convex subscription.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Session, SessionStatus, SessionType } from '@/convex/sessions';

export type { Session, SessionStatus, SessionType };

export interface SessionFilters {
  status?: SessionStatus;
  sessionType?: SessionType;
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
  sortBy: 'created_at' | 'updated_at' | 'tokens';
  sortOrder: 'asc' | 'desc';

  // Actions
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  updateSession: (sessionKey: string, changes: Partial<Session>) => void;
  removeSession: (sessionKey: string) => void;

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
   * or useSessions hook for reactive session data.
   */
  fetchAndUpdate: (isInitialLoad?: boolean) => Promise<void>;

  // Computed
  getFilteredSessions: () => Session[];
  getSessionByKey: (sessionKey: string) => Session | undefined;
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
      sortBy: 'updated_at',
      sortOrder: 'desc',

      // Data actions
      setSessions: (sessions) => set({ sessions, isLoading: false }),

      addSession: (session) =>
        set((state) => ({
          sessions: [session, ...state.sessions],
        })),

      updateSession: (sessionKey, changes) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.session_key === sessionKey ? { ...s, ...changes, updated_at: Date.now() } : s
          ),
        })),

      removeSession: (sessionKey) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.session_key !== sessionKey),
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

        if (filters.sessionType) {
          filtered = filtered.filter((s) => s.session_type === filters.sessionType);
        }

        if (filters.model) {
          filtered = filtered.filter((s) =>
            s.model?.toLowerCase().includes(filters.model!.toLowerCase())
          );
        }

        // Sort
        filtered = [...filtered].sort((a, b) => {
          let comparison = 0;

          switch (sortBy) {
            case 'created_at':
              comparison = (a.created_at ?? 0) - (b.created_at ?? 0);
              break;
            case 'updated_at':
              comparison = a.updated_at - b.updated_at;
              break;
            case 'tokens':
              comparison = (a.tokens_total ?? 0) - (b.tokens_total ?? 0);
              break;
          }

          return sortOrder === 'asc' ? comparison : -comparison;
        });

        return filtered;
      },

      getSessionByKey: (sessionKey) => {
        return get().sessions.find((s) => s.session_key === sessionKey);
      },
    }),
    { name: 'session-store' }
  )
);
