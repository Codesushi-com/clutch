'use client';

/**
 * Sessions List Page
 * Session monitoring using HTTP API with Convex task associations
 * Uses dynamic import to avoid SSR issues with Convex
 */

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

// Dynamically import SessionsList to avoid SSR issues with Convex
const SessionsList = dynamic(
  () => import('@/components/sessions/sessions-list').then(mod => ({ default: mod.SessionsList })),
  {
    ssr: false,
    loading: () => (
      <div className="container mx-auto py-8 px-4 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    ),
  }
);

export default function SessionsPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <SessionsList 
        showStats={true}
        title="Sessions"
        description="Monitor and manage OpenClaw sessions with real-time task associations"
      />
    </div>
  );
}
