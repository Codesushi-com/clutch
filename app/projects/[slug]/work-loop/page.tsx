'use client';

/**
 * Project Work Loop Page
 * Shows Observatory dashboard locked to the current project
 */

import { use, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Dynamically import ObservatoryShell to avoid SSR issues with Convex
const ObservatoryShell = dynamic(
  () => import('@/components/observatory/observatory-shell').then(mod => ({ default: mod.ObservatoryShell })),
  {
    ssr: false,
    loading: () => <ObservatorySkeleton />,
  }
);

function ObservatorySkeleton() {
  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Tabs skeleton */}
      <div className="flex items-center gap-1 border-b border-[var(--border)]">
        {['Live', 'Triage', 'Analytics', 'Models', 'Prompts'].map((tab) => (
          <div key={tab} className="px-4 py-2">
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

interface ProjectInfo {
  id: string;
  slug: string;
  name: string;
}

export default function ProjectWorkLoopPage({ params }: PageProps) {
  const { slug } = use(params);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchProject() {
      try {
        const response = await fetch(`/api/projects/${slug}`);
        if (response.ok) {
          const data = await response.json();
          setProject(data.project);
        }
      } catch (error) {
        console.error('[ProjectWorkLoopPage] Failed to fetch project:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchProject();
  }, [slug]);

  if (isLoading) {
    return <ObservatorySkeleton />;
  }

  if (!project) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Project Not Found</h1>
          <p className="text-muted-foreground mt-2">
            Could not find project with slug: {slug}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <ObservatoryShell lockedProjectId={project.id} />
    </div>
  );
}
