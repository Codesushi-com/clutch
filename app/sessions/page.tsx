'use client';

/**
 * Sessions List Page
 * Session monitoring using HTTP API instead of WebSocket
 */

import { SessionsList } from '@/components/sessions/sessions-list';

export default function SessionsPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <SessionsList 
        showStats={true}
        title="Sessions"
        description="Monitor and manage OpenClaw sessions via HTTP API"
      />
    </div>
  );
}
