'use client';

/**
 * Project Work Loop Page
 * Shows work loop activity log filtered to the current project
 */

import { use, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw } from 'lucide-react';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Dynamically import ActivityLog to avoid SSR issues with Convex
const ActivityLog = dynamic(
  () => import('@/components/observatory/live/activity-log').then(mod => ({ default: mod.ActivityLog })),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    ),
  }
);

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
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-6 w-6 text-muted-foreground" />
            <Skeleton className="h-8 w-48" />
          </div>
          <Skeleton className="h-64" />
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
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Work Loop Activity</h1>
        </div>
        <p className="text-muted-foreground">
          Recent work loop cycles and actions for the {project.name} project
        </p>
        <ActivityLog projectId={project.id} projectSlug={slug} />
      </div>
    </div>
  );
}
