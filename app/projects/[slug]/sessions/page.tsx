'use client';

/**
 * Project-Scoped Sessions Page
 * Shows sessions related to a specific project with enhanced status indicators
 * Uses dynamic import to avoid SSR issues with Convex
 */

import { use } from 'react';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Dynamically import SessionsList to avoid SSR issues with Convex
const SessionsList = dynamic(
  () => import('@/components/sessions/sessions-list').then(mod => ({ default: mod.SessionsList })),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-6">
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

export default function ProjectSessionsPage({ params }: PageProps) {
  const { slug } = use(params);

  return (
    <div className="container mx-auto py-8 px-4">
      <SessionsList 
        projectSlug={slug}
        showStats={true}
        title="Project Sessions"
        description={`Active sessions for the ${slug} project`}
      />
    </div>
  );
}
