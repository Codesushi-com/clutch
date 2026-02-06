'use client';

/**
 * Session Table Component
 * Responsive data table displaying sessions with enhanced status indicators,
 * agent type badges, and task associations
 */

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Hook that provides a time value that updates at a fixed interval.
 * Used to prevent excessive re-renders from time-based calculations.
 */
function useTickingTime(updateIntervalMs = 30000) {
  const [time, setTime] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setTime(Date.now());
    }, updateIntervalMs);

    return () => clearInterval(intervalId);
  }, [updateIntervalMs]);

  return time;
}

/**
 * Component that displays relative time with minimal re-renders.
 * Only updates when the ticking time changes (every 30s by default).
 */
function TimeAgo({ timestamp, tickingTime }: { timestamp: string; tickingTime: number }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const formatted = useMemo(() => {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  }, [timestamp, tickingTime]);

  return <span className="text-sm text-muted-foreground">{formatted}</span>;
}
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { SessionStatus, SessionType, Session } from '@/lib/types';
import { useSessionStore } from '@/lib/stores/session-store';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

// Type for table data
interface SessionRowData {
  id: string;
  name: string;
  type: SessionType;
  model: string;
  effectiveModel?: string;
  status: SessionStatus;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  duration: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  parentId?: string;
  task?: {
    id: string;
    title: string;
    status: string;
    projectSlug?: string;
  };
}

/**
 * Enhanced status type that maps session status to user-friendly labels
 * - working: Session is actively processing (running)
 * - idle: Session is waiting/idle
 * - stuck: Session has an error or is stuck
 * - done: Session completed successfully
 */
type EnhancedStatus = 'working' | 'idle' | 'stuck' | 'done';

// Helper functions
/**
 * Format a duration in milliseconds to a human-readable string.
 * Uses static computation — no live-ticking.
 */
function formatDurationMs(ms: number): string {
  if (ms < 0) ms = 0;
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatTokens(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * Map session status to enhanced status
 */
function getEnhancedStatus(session: SessionRowData): EnhancedStatus {
  if (session.status === 'running') return 'working';
  if (session.status === 'error') return 'stuck';
  if (session.status === 'completed') return 'done';
  if (session.status === 'cancelled') return 'done';
  return 'idle';
}

/**
 * Get display label for enhanced status
 */
function getStatusLabel(status: EnhancedStatus): string {
  const labels: Record<EnhancedStatus, string> = {
    working: 'Working',
    idle: 'Idle',
    stuck: 'Stuck',
    done: 'Done',
  };
  return labels[status];
}

/**
 * Get badge variant for enhanced status
 */
function getStatusVariant(status: EnhancedStatus): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' {
  const variants: Record<EnhancedStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success'> = {
    working: 'default',   // Blue (default)
    idle: 'secondary',    // Gray
    stuck: 'destructive', // Red
    done: 'success',      // Green
  };
  return variants[status];
}

/**
 * Get color styles for agent type badge
 */
function getAgentTypeStyles(type: SessionType): { bg: string; text: string; border: string } {
  const styles: Record<SessionType, { bg: string; text: string; border: string }> = {
    main: {
      bg: 'bg-blue-500/10',
      text: 'text-blue-600',
      border: 'border-blue-500/30',
    },
    isolated: {
      bg: 'bg-purple-500/10',
      text: 'text-purple-600',
      border: 'border-purple-500/30',
    },
    subagent: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-600',
      border: 'border-amber-500/30',
    },
  };
  return styles[type];
}

/**
 * Get display label for agent type
 */
function getAgentTypeLabel(type: SessionType, parentId?: string): string {
  if (type === 'subagent' || parentId) return 'Agent';
  if (type === 'isolated') return 'Isolated';
  return 'Main';
}

// Sort header component
function SortHeader({
  column,
  children,
}: {
  column: { getIsSorted: () => false | 'asc' | 'desc'; toggleSorting: (desc?: boolean) => void };
  children: React.ReactNode;
}) {
  const sorted = column.getIsSorted();
  
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => column.toggleSorting(sorted === 'asc')}
      className="h-8 px-2 -ml-2"
    >
      {children}
      {sorted === 'asc' ? (
        <ArrowUp className="ml-2 h-3 w-3" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="ml-2 h-3 w-3" />
      ) : (
        <ArrowUpDown className="ml-2 h-3 w-3" />
      )}
    </Button>
  );
}

// Status badge with dot indicator
function StatusBadge({ status }: { status: EnhancedStatus }) {
  const variant = getStatusVariant(status);
  const dotColors: Record<EnhancedStatus, string> = {
    working: 'bg-blue-500',
    idle: 'bg-gray-400',
    stuck: 'bg-red-500',
    done: 'bg-green-500',
  };

  return (
    <Badge variant={variant} className="capitalize flex items-center gap-1.5">
      <span className="relative flex h-1.5 w-1.5">
        {status === 'working' && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        )}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotColors[status]}`} />
      </span>
      {getStatusLabel(status)}
    </Badge>
  );
}

// Agent type badge with custom colors
function AgentTypeBadge({ type, parentId }: { type: SessionType; parentId?: string }) {
  const styles = getAgentTypeStyles(type);
  const label = getAgentTypeLabel(type, parentId);

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles.bg} ${styles.text} ${styles.border}`}
    >
      {label}
    </span>
  );
}

// Task link component
function TaskLink({ task }: { task?: SessionRowData['task'] }) {
  const router = useRouter();

  if (!task) {
    return (
      <span className="text-sm text-muted-foreground italic">
        No task
      </span>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const projectSlug = task.projectSlug || 'default';
    router.push(`/projects/${projectSlug}/board?task=${task.id}`);
  };

  const statusColors: Record<string, string> = {
    backlog: 'text-gray-500',
    ready: 'text-blue-500',
    in_progress: 'text-amber-500',
    in_review: 'text-purple-500',
    done: 'text-green-500',
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 hover:underline transition-colors"
      title={`Open task: ${task.title}`}
    >
      <span className="truncate max-w-[150px]">{task.title}</span>
      <ExternalLink className="h-3 w-3 flex-shrink-0" />
      <span className={`text-xs ${statusColors[task.status] || 'text-gray-500'}`}>
        ({task.status.replace('_', ' ')})
      </span>
    </button>
  );
}

// Define columns
const getColumns = (tickingTime: number): ColumnDef<SessionRowData>[] => [
  {
    accessorKey: 'name',
    header: ({ column }) => <SortHeader column={column}>Session</SortHeader>,
    cell: ({ row }) => (
      <div className="flex flex-col gap-1">
        <span className="font-medium truncate max-w-[200px]" title={row.original.name}>
          {row.original.name}
        </span>
        <div className="flex items-center gap-2">
          <AgentTypeBadge type={row.original.type} parentId={row.original.parentId} />
          {row.original.parentId && (
            <span className="text-xs text-muted-foreground">(sub)</span>
          )}
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <SortHeader column={column}>Status</SortHeader>,
    cell: ({ row }) => {
      const enhancedStatus = getEnhancedStatus(row.original);
      return <StatusBadge status={enhancedStatus} />;
    },
  },
  {
    accessorKey: 'task',
    header: ({ column }) => <SortHeader column={column}>Task</SortHeader>,
    cell: ({ row }) => <TaskLink task={row.original.task} />,
  },
  {
    accessorKey: 'effectiveModel',
    header: ({ column }) => <SortHeader column={column}>Model</SortHeader>,
    cell: ({ row }) => {
      const effectiveModel = row.original.effectiveModel || row.original.model;
      const hasOverride = row.original.effectiveModel && row.original.effectiveModel !== row.original.model;
      return (
        <span
          className={`text-sm truncate max-w-[150px] inline-block ${hasOverride ? 'text-primary font-medium' : ''}`}
          title={effectiveModel}
        >
          {effectiveModel.split('/').pop() || effectiveModel}
        </span>
      );
    },
  },
  {
    accessorKey: 'totalTokens',
    header: ({ column }) => <SortHeader column={column}>Tokens</SortHeader>,
    cell: ({ row }) => {
      const tokens = row.original.tokens?.total || 0;
      return (
        <div className="flex flex-col">
          <span className="tabular-nums text-sm">{formatTokens(tokens)}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'duration',
    header: ({ column }) => <SortHeader column={column}>Duration</SortHeader>,
    cell: ({ row }) => (
      <span className="tabular-nums text-sm">{row.original.duration}</span>
    ),
  },
  {
    accessorKey: 'updatedAt',
    header: ({ column }) => <SortHeader column={column}>Last Active</SortHeader>,
    cell: ({ row }) => {
      const ts = row.original.updatedAt;
      if (!ts) return <span className="text-sm text-muted-foreground">—</span>;
      return <TimeAgo timestamp={ts} tickingTime={tickingTime} />;
    },
  },
];

// Mobile Card Component
function SessionCard({
  session,
  onRowClick,
  tickingTime,
}: {
  session: SessionRowData;
  onRowClick?: (sessionId: string) => void;
  tickingTime: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const enhancedStatus = getEnhancedStatus(session);

  const handleTaskClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (session.task) {
      const projectSlug = session.task.projectSlug || 'default';
      router.push(`/projects/${projectSlug}/board?task=${session.task.id}`);
    }
  };

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onRowClick?.(session.id)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{session.name}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <AgentTypeBadge type={session.type} parentId={session.parentId} />
              <StatusBadge status={enhancedStatus} />
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 h-8 w-8 p-0"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
        
        {/* Task info on card header */}
        {session.task && (
          <div className="mt-2">
            <button
              onClick={handleTaskClick}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <span className="truncate max-w-[200px]">{session.task.title}</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        )}
        
        <div className="flex items-center justify-between text-sm text-muted-foreground mt-2">
          <span>
            {session.updatedAt
              ? <TimeAgo timestamp={session.updatedAt} tickingTime={tickingTime} />
              : '—'
            }
          </span>
          <span className="tabular-nums">{session.duration}</span>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Model:</span>
              <span
                className={`text-right truncate ml-2 ${session.effectiveModel && session.effectiveModel !== session.model ? 'text-primary font-medium' : ''}`}
                title={session.effectiveModel || session.model}
              >
                {(session.effectiveModel || session.model).split('/').pop()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tokens:</span>
              <span className="tabular-nums">
                {formatTokens(session.tokens?.total || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Session ID:</span>
              <span className="font-mono text-xs truncate ml-2" title={session.id}>
                {session.id.slice(0, 8)}...
              </span>
            </div>
            {!session.task && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Task:</span>
                <span className="text-muted-foreground italic">No task linked</span>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// Loading skeleton
function TableSkeleton() {
  return (
    <>
      {/* Desktop skeleton */}
      <div className="hidden md:block space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b">
            <Skeleton className="h-4 w-[200px]" />
            <Skeleton className="h-4 w-[80px]" />
            <Skeleton className="h-4 w-[150px]" />
            <Skeleton className="h-4 w-[150px]" />
            <Skeleton className="h-4 w-[80px]" />
            <Skeleton className="h-4 w-[80px]" />
            <Skeleton className="h-4 w-[100px]" />
          </div>
        ))}
      </div>

      {/* Mobile skeleton */}
      <div className="md:hidden space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="space-y-2">
                <Skeleton className="h-5 w-[60%]" />
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </>
  );
}

// Empty state
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <svg
          className="h-8 w-8 text-muted-foreground"
          fill="none"
          height="24"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 2v20" />
          <path d="M2 12h20" />
        </svg>
      </div>
      <h3 className="text-lg font-medium">No sessions found</h3>
      <p className="text-sm text-muted-foreground mt-1">
        There are no active or recent sessions to display.
      </p>
    </div>
  );
}

interface SessionTableProps {
  onRowClick?: (sessionId: string) => void;
  filteredSessions?: Session[];
}

export function SessionTable({ onRowClick, filteredSessions }: SessionTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'updatedAt', desc: true },
  ]);

  const storeSessions = useSessionStore((state) => state.sessions);
  const isLoading = useSessionStore((state) => state.isLoading);
  const error = useSessionStore((state) => state.error);

  // Use filtered sessions if provided, otherwise use store sessions
  const rawSessions = filteredSessions || storeSessions;

  // Shared ticking time for relative time displays - updates every 30s
  const tickingTime = useTickingTime(30000);

  // Transform sessions for table — compute duration once from timestamps, no live ticking.
  // Since we only have updatedAt (not true createdAt), "duration" shows time since
  // last activity for running sessions, or "—" for completed ones.
  // Use useMemo to prevent recreating data on every render (fixes infinite re-render bug)
  const data: SessionRowData[] = useMemo(() => {
    const now = Date.now();
    return (filteredSessions || rawSessions).map((session) => {
      const updatedMs = new Date(session.updatedAt).getTime();
      const ageMs = now - updatedMs;
      // For completed sessions, duration is meaningless without a true start time — show "—"
      // For running/idle, show how long ago the session was last active
      const duration = session.completedAt
        ? "—"
        : formatDurationMs(ageMs);

      return {
        ...session,
        duration,
        task: session.task,
      };
    });
  }, [filteredSessions, rawSessions]);

  const columns = getColumns(tickingTime);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (isLoading) {
    return <TableSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-destructive/10 p-4 mb-4">
          <svg
            className="h-8 w-8 text-destructive"
            fill="none"
            height="24"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
        </div>
        <h3 className="text-lg font-medium">Failed to load sessions</h3>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return <EmptyState />;
  }

  // Get sorted data for mobile view
  const sortedData = table.getRowModel().rows.map(row => row.original);

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onRowClick?.(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {sortedData.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onRowClick={onRowClick}
            tickingTime={tickingTime}
          />
        ))}
      </div>
    </>
  );
}
