'use client';

/**
 * Session Detail Page
 * View detailed information about a specific session
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '@/lib/stores/session-store';

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  
  const [isLoading, setIsLoading] = useState(true);
  const session = useSessionStore((state) => state.getSessionById(sessionId));

  useEffect(() => {
    // Simulate loading for demo
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Button variant="ghost" onClick={() => router.push('/sessions')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Sessions
        </Button>
        <div className="rounded-lg border p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">Session Not Found</h1>
          <p className="text-muted-foreground">
            The session you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <Button variant="ghost" onClick={() => router.push('/sessions')} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Sessions
      </Button>

      <div className="rounded-lg border bg-card p-6">
        <h1 className="text-2xl font-bold mb-4">{session.name}</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <div className="text-sm text-muted-foreground">ID</div>
            <div className="font-mono text-sm">{session.id}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Type</div>
            <div className="capitalize">{session.type}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Model</div>
            <div>{session.model}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Status</div>
            <div className="capitalize">{session.status}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Created</div>
            <div>{new Date(session.createdAt).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Last Updated</div>
            <div>{new Date(session.updatedAt).toLocaleString()}</div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h2 className="text-lg font-semibold mb-4">Token Usage</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground">Input</div>
              <div className="text-2xl font-bold">{session.tokens.input.toLocaleString()}</div>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground">Output</div>
              <div className="text-2xl font-bold">{session.tokens.output.toLocaleString()}</div>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground">Total</div>
              <div className="text-2xl font-bold">{session.tokens.total.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {session.parentId && (
          <div className="border-t pt-6 mt-6">
            <div className="text-sm text-muted-foreground">Parent Session</div>
            <Button
              variant="link"
              className="p-0 h-auto font-mono"
              onClick={() => router.push(`/sessions/${session.parentId}`)}
            >
              {session.parentId}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
