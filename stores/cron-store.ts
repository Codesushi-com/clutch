import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

export interface CronSchedule {
  kind: 'at' | 'every' | 'cron';
  atMs?: number;
  everyMs?: number;
  anchorMs?: number;
  expr?: string;
  tz?: string;
}

export interface CronPayload {
  kind: 'systemEvent' | 'agentTurn' | 'script';
  text?: string;
  message?: string;
  command?: string;
  model?: string;
  thinking?: string;
  timeoutSeconds?: number;
  deliver?: boolean;
  channel?: string;
  to?: string;
  bestEffortDeliver?: boolean;
}

export interface CronJob {
  jobId: string;
  name: string | null;
  schedule: CronSchedule;
  payload: CronPayload;
  sessionTarget: 'main' | 'isolated';
  enabled: boolean;
  
  // Runtime state
  status: 'enabled' | 'disabled' | 'running' | 'failed';
  nextRun: Date | null;
  lastRun: Date | null;
  lastStatus: 'success' | 'failure' | null;
  lastError: string | null;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  runCount: number;
  successCount: number;
  failureCount: number;
  
  // Project association
  projectTag: string | null;
}

export interface CronRun {
  runId: string;
  jobId: string;
  startTime: Date;
  endTime: Date | null;
  status: 'running' | 'success' | 'failure' | 'timeout';
  duration: number | null;
  error: string | null;
  output: string | null;
}

export interface CronEvent {
  type: 'job.created' | 'job.updated' | 'job.deleted' | 'job.triggered' | 'run.started' | 'run.completed';
  jobId: string;
  job?: CronJob;
  run?: CronRun;
}

export interface CronState {
  jobs: Map<string, CronJob>;
  runs: Map<string, CronRun[]>; // jobId -> runs array
  isLoading: boolean;
  lastUpdate: Date | null;
  
  // Batch update management for high-frequency events
  pendingUpdates: Map<string, Partial<CronJob>>;
  updateTimeout: NodeJS.Timeout | null;
  
  // Actions
  setJobs: (jobs: CronJob[]) => void;
  addJob: (job: CronJob) => void;
  updateJob: (jobId: string, updates: Partial<CronJob>) => void;
  removeJob: (jobId: string) => void;
  handleEvent: (event: CronEvent) => void;
  setLoading: (loading: boolean) => void;
  
  // Run management
  setJobRuns: (jobId: string, runs: CronRun[]) => void;
  addJobRun: (run: CronRun) => void;
  updateJobRun: (runId: string, updates: Partial<CronRun>) => void;
  
  // Batched updates
  batchUpdateJob: (jobId: string, updates: Partial<CronJob>) => void;
  flushPendingUpdates: () => void;
  
  // Actions for job control
  triggerJob: (jobId: string) => Promise<void>;
  toggleJobStatus: (jobId: string) => Promise<void>;
  
  // Selectors
  getEnabledJobs: () => CronJob[];
  getJobsByProject: (projectTag: string) => CronJob[];
  getRunningJobs: () => CronJob[];
  getJobRuns: (jobId: string) => CronRun[];
  getRecentRuns: (limit?: number) => CronRun[];
}

export const useCronStore = create<CronState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // Initial state
      jobs: new Map(),
      runs: new Map(),
      isLoading: false,
      lastUpdate: null,
      pendingUpdates: new Map(),
      updateTimeout: null,
      
      // Actions
      setJobs: (jobs: CronJob[]) => {
        const jobMap = new Map();
        jobs.forEach(job => {
          jobMap.set(job.jobId, job);
        });
        set({ 
          jobs: jobMap, 
          lastUpdate: new Date(),
          isLoading: false 
        });
      },
      
      addJob: (job: CronJob) => {
        set((state) => ({
          jobs: new Map(state.jobs).set(job.jobId, job),
          lastUpdate: new Date()
        }));
      },
      
      updateJob: (jobId: string, updates: Partial<CronJob>) => {
        set((state) => {
          const jobs = new Map(state.jobs);
          const existing = jobs.get(jobId);
          if (existing) {
            jobs.set(jobId, { 
              ...existing, 
              ...updates, 
              updatedAt: new Date() 
            });
          }
          return {
            jobs,
            lastUpdate: new Date()
          };
        });
      },
      
      removeJob: (jobId: string) => {
        set((state) => {
          const jobs = new Map(state.jobs);
          const runs = new Map(state.runs);
          jobs.delete(jobId);
          runs.delete(jobId);
          return {
            jobs,
            runs,
            lastUpdate: new Date()
          };
        });
      },
      
      handleEvent: (event: CronEvent) => {
        const { type, jobId, job, run } = event;
        
        switch (type) {
          case 'job.created':
            if (job) {
              get().addJob(job);
            }
            break;
            
          case 'job.updated':
            if (job) {
              get().updateJob(jobId, job);
            }
            break;
            
          case 'job.deleted':
            get().removeJob(jobId);
            break;
            
          case 'job.triggered':
            get().updateJob(jobId, { 
              status: 'running',
              lastRun: new Date()
            });
            break;
            
          case 'run.started':
            if (run) {
              get().addJobRun(run);
              get().updateJob(jobId, { status: 'running' });
            }
            break;
            
          case 'run.completed':
            if (run) {
              get().updateJobRun(run.runId, run);
              get().updateJob(jobId, { 
                status: run.status === 'success' ? 'enabled' : 'failed',
                lastStatus: run.status === 'success' ? 'success' : 'failure',
                lastError: run.error,
                runCount: get().jobs.get(jobId)?.runCount || 0 + 1,
                successCount: run.status === 'success' ? 
                  (get().jobs.get(jobId)?.successCount || 0) + 1 : 
                  get().jobs.get(jobId)?.successCount || 0,
                failureCount: run.status === 'failure' ? 
                  (get().jobs.get(jobId)?.failureCount || 0) + 1 : 
                  get().jobs.get(jobId)?.failureCount || 0,
              });
            }
            break;
        }
      },
      
      setLoading: (loading: boolean) => set({ isLoading: loading }),
      
      // Run management
      setJobRuns: (jobId: string, runs: CronRun[]) => {
        set((state) => ({
          runs: new Map(state.runs).set(jobId, runs),
          lastUpdate: new Date()
        }));
      },
      
      addJobRun: (run: CronRun) => {
        set((state) => {
          const runs = new Map(state.runs);
          const jobRuns = runs.get(run.jobId) || [];
          runs.set(run.jobId, [...jobRuns, run]);
          return {
            runs,
            lastUpdate: new Date()
          };
        });
      },
      
      updateJobRun: (runId: string, updates: Partial<CronRun>) => {
        set((state) => {
          const runs = new Map(state.runs);
          
          for (const [jobId, jobRuns] of Array.from(runs.entries())) {
            const index = jobRuns.findIndex((r: CronRun) => r.runId === runId);
            if (index !== -1) {
              const updatedRuns = [...jobRuns];
              updatedRuns[index] = { ...updatedRuns[index], ...updates };
              runs.set(jobId, updatedRuns);
              break;
            }
          }
          
          return {
            runs,
            lastUpdate: new Date()
          };
        });
      },
      
      // Batched updates to prevent render storms
      batchUpdateJob: (jobId: string, updates: Partial<CronJob>) => {
        const state = get();
        
        // Add to pending updates
        const pending = new Map(state.pendingUpdates);
        const existing = pending.get(jobId) || {};
        pending.set(jobId, { ...existing, ...updates });
        
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
        pendingUpdates.forEach((updates, jobId) => {
          get().updateJob(jobId, updates);
        });
        
        set({ 
          pendingUpdates: new Map(), 
          updateTimeout: null 
        });
      },
      
      // Job control actions (these would call the actual RPC client)
      triggerJob: async (jobId: string) => {
        // TODO: Implement actual RPC call when RPC client is available
        console.log('Triggering job:', jobId);
        // For now, just update local state
        get().updateJob(jobId, { 
          status: 'running',
          lastRun: new Date() 
        });
      },
      
      toggleJobStatus: async (jobId: string) => {
        const job = get().jobs.get(jobId);
        if (job) {
          // TODO: Implement actual RPC call when RPC client is available
          console.log('Toggling job status:', jobId, !job.enabled);
          get().updateJob(jobId, { 
            enabled: !job.enabled,
            status: !job.enabled ? 'enabled' : 'disabled' 
          });
        }
      },
      
      // Selector helpers
      getEnabledJobs: () => {
        const jobs = Array.from(get().jobs.values());
        return jobs.filter(j => j.enabled);
      },
      
      getJobsByProject: (projectTag: string) => {
        const jobs = Array.from(get().jobs.values());
        return jobs.filter(j => j.projectTag === projectTag);
      },
      
      getRunningJobs: () => {
        const jobs = Array.from(get().jobs.values());
        return jobs.filter(j => j.status === 'running');
      },
      
      getJobRuns: (jobId: string) => {
        return get().runs.get(jobId) || [];
      },
      
      getRecentRuns: (limit: number = 10) => {
        const allRuns: CronRun[] = [];
        for (const runs of Array.from(get().runs.values())) {
          allRuns.push(...runs);
        }
        
        return allRuns
          .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
          .slice(0, limit);
      }
    })),
    {
      name: 'cron-store',
    }
  )
);

// Selector hooks for common use cases
export const useCronJobs = () => useCronStore((state) => Array.from(state.jobs.values()));
export const useEnabledCronJobs = () => useCronStore((state) => state.getEnabledJobs());
export const useRunningCronJobs = () => useCronStore((state) => state.getRunningJobs());
export const useCronJob = (jobId: string) => useCronStore((state) => state.jobs.get(jobId));
export const useCronJobRuns = (jobId: string) => useCronStore((state) => state.getJobRuns(jobId));
export const useCronLoading = () => useCronStore((state) => state.isLoading);