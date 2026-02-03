import Link from 'next/link';
import { Activity, Clock, BarChart3, Settings } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto py-12 px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">🦞 The Trap</h1>
          <p className="text-xl text-muted-foreground">
            Real-time dashboard for OpenClaw AI agents
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {/* Sessions Card */}
          <Link href="/sessions">
            <div className="group rounded-xl border bg-card p-6 transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer">
              <div className="mb-4 rounded-full bg-primary/10 p-3 w-fit group-hover:bg-primary/20">
                <Activity className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Sessions</h2>
              <p className="text-sm text-muted-foreground">
                Monitor active sessions, view real-time updates, and manage agent processes.
              </p>
            </div>
          </Link>

          {/* Cron Jobs Card - Placeholder */}
          <div className="rounded-xl border bg-card p-6 opacity-60">
            <div className="mb-4 rounded-full bg-muted p-3 w-fit">
              <Clock className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Cron Jobs</h2>
            <p className="text-sm text-muted-foreground">
              Manage scheduled tasks and view execution history. (Coming soon)
            </p>
          </div>

          {/* Analytics Card - Placeholder */}
          <div className="rounded-xl border bg-card p-6 opacity-60">
            <div className="mb-4 rounded-full bg-muted p-3 w-fit">
              <BarChart3 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Analytics</h2>
            <p className="text-sm text-muted-foreground">
              Track token usage, costs, and model performance metrics. (Coming soon)
            </p>
          </div>

          {/* Settings Card - Placeholder */}
          <div className="rounded-xl border bg-card p-6 opacity-60">
            <div className="mb-4 rounded-full bg-muted p-3 w-fit">
              <Settings className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Settings</h2>
            <p className="text-sm text-muted-foreground">
              Configure dashboard preferences and connections. (Coming soon)
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
