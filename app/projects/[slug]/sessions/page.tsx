'use client';

/**
 * Project-Scoped Sessions Page
 * Shows sessions related to a specific project with enhanced status indicators
 * Uses dynamic import to avoid SSR issues with Convex
 */

import { use, useEffect, useState } from 'react';
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

interface ProjectInfo {
  id: string;
  slug: string;
  name: string;
}

export default function ProjectSessionsPage({ params }: PageProps) {
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
        console.error('[ProjectSessionsPage] Failed to fetch project:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchProject();
  }, [slug]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
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
      </div>
    );
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
      <SessionsList
        projectSlug={slug}
        projectId={project.id}
        showStats={true}
        title="Project Sessions"
        description={`Active agent sessions for the ${slug} project`}
      />
    </div>
  );
}
