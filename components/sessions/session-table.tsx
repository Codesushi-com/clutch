'use client';

/**
 * Session Table Component
 * Responsive data table displaying sessions with sorting and filtering
 * Shows table view on desktop, card view on mobile
 */

import { useState } from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { SessionStatus, SessionType } from '@/lib/types';
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
  status: SessionStatus;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  duration: string;
  createdAt: string;
  updatedAt: string;
  parentId?: string;
}

// Helper functions
function formatDuration(startTime: string, endTime?: string): string {
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  const diffMs = end.getTime() - start.getTime();
  
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  
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

const statusVariants: Record<SessionStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success'> = {
  running: 'default',
  idle: 'secondary',
  completed: 'success',
  error: 'destructive',
  cancelled: 'outline',
};

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

// Define columns
const columns: ColumnDef<SessionRowData>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <SortHeader column={column}>Session</SortHeader>,
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.original.name}</span>
        <span className="text-xs text-muted-foreground capitalize">
          {row.original.type}
          {row.original.parentId && (
            <span className="ml-1">(sub-agent)</span>
          )}
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'model',
    header: ({ column }) => <SortHeader column={column}>Model</SortHeader>,
    cell: ({ row }) => (
      <span className="text-sm truncate max-w-[180px] inline-block" title={row.original.model}>
        {row.original.model}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <SortHeader column={column}>Status</SortHeader>,
    cell: ({ row }) => (
      <Badge variant={statusVariants[row.original.status]} className="capitalize">
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: 'totalTokens',
    header: ({ column }) => <SortHeader column={column}>Tokens</SortHeader>,
    cell: ({ row }) => {
      const tokens = row.original.tokens?.total || 0;
      return (
        <div className="flex flex-col">
          <span className="tabular-nums">{formatTokens(tokens)}</span>
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
      return (
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(ts), { addSuffix: true })}
        </span>
      );
    },
  },
];

// Mobile Card Component
function SessionCard({ 
  session, 
  onRowClick 
}: { 
  session: SessionRowData; 
  onRowClick?: (sessionId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onRowClick?.(session.id)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{session.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground capitalize">
                {session.type}
                {session.parentId && <span className="ml-1">(sub-agent)</span>}
              </span>
              <Badge 
                variant={statusVariants[session.status]} 
                className="capitalize text-xs"
              >
                {session.status}
              </Badge>
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
        
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {session.updatedAt 
              ? formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })
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
              <span className="text-right truncate ml-2" title={session.model}>
                {session.model}
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
            <Skeleton className="h-4 w-[150px]" />
            <Skeleton className="h-4 w-[80px]" />
            <Skeleton className="h-4 w-[100px]" />
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
}

export function SessionTable({ onRowClick }: SessionTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'updatedAt', desc: true },
  ]);
  
  const sessions = useSessionStore((state) => state.sessions);
  const isLoading = useSessionStore((state) => state.isLoading);
  const error = useSessionStore((state) => state.error);

  // Transform sessions for table
  const data: SessionRowData[] = sessions.map((session) => ({
    ...session,
    duration: formatDuration(session.createdAt, session.completedAt),
  }));

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
          />
        ))}
      </div>
    </>
  );
}