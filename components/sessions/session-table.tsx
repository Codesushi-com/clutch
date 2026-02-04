'use client';

/**
 * Session Table Component
 * Data table displaying sessions with sorting and filtering
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
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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

// Loading skeleton
function TableSkeleton() {
  return (
    <div className="space-y-2">
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

  return (
    <div className="rounded-md border">
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
  );
}
