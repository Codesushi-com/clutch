'use client';

/**
 * Session Table Component
 * Responsive data table displaying sessions with enhanced status indicators,
 * agent type badges, and task associations
 *
 * Updated to use the new Convex sessions table with full token breakdown
 * and cost tracking.
 */

import { useState, useMemo, useEffect } from 'react';

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
function TimeAgo({ timestamp, tickingTime }: { timestamp: number; tickingTime: number }) {
   
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
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp, DollarSign } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Session, SessionStatus, SessionType } from '@/convex/sessions';
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
  session_key: string;
  session_type: SessionType;
  model: string | null;
  provider: string | null;
  status: SessionStatus;
  tokens: {
    input: number | null;
    output: number | null;
    cache_read: number | null;
    cache_write: number | null;
    total: number | null;
  };
  cost: {
    total: number | null;
  };
  duration: string;
  updated_at: number;
  completed_at: number | null;
  task_id: string | null;
  project_slug: string | null;
}

/**
 * Enhanced status type that maps session status to user-friendly labels
 * - working: Session is actively processing (active)
 * - idle: Session is waiting/idle
 * - stuck: Session is stale or errored
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

function formatTokens(count: number | null): string {
  if (!count) return '0';
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

function formatCost(cost: number | null): string {
  if (!cost) return '—';
  if (cost >= 1) {
    return `$${cost.toFixed(2)}`;
  }
  if (cost >= 0.01) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(4)}`;
}

/**
 * Map session status to enhanced status
 */
function getEnhancedStatus(session: SessionRowData): EnhancedStatus {
  if (session.status === 'active') return 'working';
  if (session.status === 'stale') return 'stuck';
  if (session.status === 'completed') return 'done';
  return 'idle';
}

/**
 * Get display label for enhanced status
 */
function getStatusLabel(status: EnhancedStatus): string {
  const labels: Record<EnhancedStatus, string> = {
    working: 'Working',
    idle: 'Idle',
    stuck: 'Stale',
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
    agent: {
      bg: 'bg-purple-500/10',
      text: 'text-purple-600',
      border: 'border-purple-500/30',
    },
    chat: {
      bg: 'bg-green-500/10',
      text: 'text-green-600',
      border: 'border-green-500/30',
    },
    cron: {
      bg: 'bg-orange-500/10',
      text: 'text-orange-600',
      border: 'border-orange-500/30',
    },
  };
  return styles[type];
}

/**
 * Get display label for agent type
 */
function getAgentTypeLabel(type: SessionType): string {
  if (type === 'agent') return 'Agent';
  if (type === 'chat') return 'Chat';
  if (type === 'cron') return 'Cron';
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
function AgentTypeBadge({ type }: { type: SessionType }) {
  const styles = getAgentTypeStyles(type);
  const label = getAgentTypeLabel(type);

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles.bg} ${styles.text} ${styles.border}`}
    >
      {label}
    </span>
  );
}

// Define columns
const getColumns = (tickingTime: number): ColumnDef<SessionRowData>[] => [
  {
    accessorKey: 'session_key',
    header: ({ column }) => <SortHeader column={column}>Session</SortHeader>,
    cell: ({ row }) => (
      <div className="flex flex-col gap-1">
        <span className="font-medium truncate max-w-[200px] font-mono text-xs" title={row.original.session_key}>
          {row.original.session_key.length > 40 ? row.original.session_key.slice(0, 40) + '...' : row.original.session_key}
        </span>
        <AgentTypeBadge type={row.original.session_type} />
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
    accessorKey: 'model',
    header: ({ column }) => <SortHeader column={column}>Model</SortHeader>,
    cell: ({ row }) => {
      const model = row.original.model;
      const provider = row.original.provider;
      if (!model) return <span className="text-muted-foreground italic">Unknown</span>;

      const displayModel = model.split('/').pop() || model;
      return (
        <span
          className="text-sm truncate max-w-[150px] inline-block"
          title={model}
        >
          {provider && <span className="text-muted-foreground">{provider}/</span>}
          {displayModel}
        </span>
      );
    },
  },
  {
    accessorKey: 'tokens',
    header: ({ column }) => <SortHeader column={column}>Tokens</SortHeader>,
    cell: ({ row }) => {
      const tokens = row.original.tokens;
      return (
        <div className="flex flex-col text-xs">
          <span className="tabular-nums font-medium">{formatTokens(tokens.total)} total</span>
          <span className="text-muted-foreground text-[10px]">
            In: {formatTokens(tokens.input)} · Out: {formatTokens(tokens.output)}
          </span>
          {(tokens.cache_read || tokens.cache_write) && (
            <span className="text-muted-foreground text-[10px]">
              Cache: +{formatTokens(tokens.cache_read)}/-{formatTokens(tokens.cache_write)}
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'cost',
    header: ({ column }) => <SortHeader column={column}>Cost</SortHeader>,
    cell: ({ row }) => {
      const cost = row.original.cost.total;
      if (!cost) {
        return <span className="text-muted-foreground text-xs">—</span>;
      }
      return (
        <div className="flex items-center gap-1 text-xs">
          <DollarSign className="h-3 w-3 text-green-500" />
          <span className="tabular-nums font-medium">{formatCost(cost)}</span>
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
    accessorKey: 'updated_at',
    header: ({ column }) => <SortHeader column={column}>Last Active</SortHeader>,
    cell: ({ row }) => {
      const ts = row.original.updated_at;
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
  onRowClick?: (sessionKey: string) => void;
  tickingTime: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const enhancedStatus = getEnhancedStatus(session);

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onRowClick?.(session.session_key)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate font-mono text-xs">{session.session_key}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <AgentTypeBadge type={session.session_type} />
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

        <div className="flex items-center justify-between text-sm text-muted-foreground mt-2">
          <span>
            {session.updated_at
              ? <TimeAgo timestamp={session.updated_at} tickingTime={tickingTime} />
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
                className="text-right truncate ml-2"
                title={session.model || ''}
              >
                {session.model?.split('/').pop() || 'Unknown'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tokens:</span>
              <div className="text-right text-xs">
                <div className="tabular-nums font-medium">{formatTokens(session.tokens.total)} total</div>
                <div className="text-muted-foreground">
                  In: {formatTokens(session.tokens.input)} · Out: {formatTokens(session.tokens.output)}
                </div>
              </div>
            </div>
            {session.cost.total && session.cost.total > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cost:</span>
                <span className="tabular-nums text-green-600">{formatCost(session.cost.total)}</span>
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
  onRowClick?: (sessionKey: string) => void;
  filteredSessions?: Session[];
}

// Transform Session to SessionRowData
function transformSession(session: Session): SessionRowData {
  const now = Date.now();
  const updatedMs = session.updated_at;
  const ageMs = now - updatedMs;

  // For completed sessions, show duration from created to completed
  // For running/idle, show how long ago the session was last active
  const duration = session.completed_at
    ? formatDurationMs(session.completed_at - (session.created_at || session.completed_at))
    : formatDurationMs(ageMs);

  return {
    session_key: session.session_key,
    session_type: session.session_type,
    model: session.model,
    provider: session.provider,
    status: session.status,
    tokens: {
      input: session.tokens_input,
      output: session.tokens_output,
      cache_read: session.tokens_cache_read,
      cache_write: session.tokens_cache_write,
      total: session.tokens_total,
    },
    cost: {
      total: session.cost_total,
    },
    duration,
    updated_at: session.updated_at,
    completed_at: session.completed_at,
    task_id: session.task_id,
    project_slug: session.project_slug,
  };
}

export function SessionTable({ onRowClick, filteredSessions }: SessionTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'updated_at', desc: true },
  ]);

  const storeSessions = useSessionStore((state) => state.sessions);
  const isLoading = useSessionStore((state) => state.isLoading);
  const error = useSessionStore((state) => state.error);

  // Use filtered sessions if provided, otherwise use store sessions
  const rawSessions = filteredSessions || storeSessions;

  // Shared ticking time for relative time displays - updates every 30s
  const tickingTime = useTickingTime(30000);

  // Transform sessions for table
  const data: SessionRowData[] = useMemo(() => {
    return (rawSessions || []).map(transformSession);
  }, [rawSessions]);

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
                onClick={() => onRowClick?.(row.original.session_key)}
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
            key={session.session_key}
            session={session}
            onRowClick={onRowClick}
            tickingTime={tickingTime}
          />
        ))}
      </div>
    </>
  );
}
