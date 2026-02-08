'use client';

/**
 * Session Row Component
 * Individual row displaying session information
 *
 * Updated to use the new Convex sessions table schema.
 */

import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Pause, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import type { Session, SessionStatus } from '@/convex/sessions';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SessionRowProps {
  session: Session;
}

const statusConfig: Record<SessionStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success'; icon: React.ReactNode }> = {
  active: {
    label: 'Active',
    variant: 'default',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  idle: {
    label: 'Idle',
    variant: 'secondary',
    icon: <Pause className="h-3 w-3" />,
  },
  completed: {
    label: 'Completed',
    variant: 'success',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  stale: {
    label: 'Stale',
    variant: 'destructive',
    icon: <XCircle className="h-3 w-3" />,
  },
};

function formatDuration(startTime: number | null, endTime: number | null): string {
  // Without a true created_at, we can't compute meaningful duration.
  // Show "—" for sessions without a completion time instead of live-ticking.
  if (!startTime || !endTime) return '—';
  const diffMs = endTime - startTime;

  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);

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

export function SessionRow({ session }: SessionRowProps) {
  const router = useRouter();
  const status = statusConfig[session.status];
  const duration = formatDuration(session.created_at, session.completed_at);

  const handleClick = () => {
    router.push(`/sessions/${encodeURIComponent(session.session_key)}`);
  };

  // Extract display name from session_key
  const displayName = session.session_key.split(':').pop() || session.session_key;

  return (
    <TooltipProvider>
      <tr
        onClick={handleClick}
        className="cursor-pointer transition-colors hover:bg-muted/50 border-b"
      >
        {/* Session Name & Type */}
        <td className="px-4 py-3">
          <div className="flex flex-col">
            <span className="font-medium text-sm font-mono">{displayName}</span>
            <span className="text-xs text-muted-foreground capitalize">
              {session.session_type}
            </span>
          </div>
        </td>

        {/* Model */}
        <td className="px-4 py-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm truncate max-w-[150px] inline-block">
                {session.model || 'Unknown'}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{session.model || 'Unknown'}</p>
              {session.provider && (
                <p className="text-xs text-muted-foreground">Provider: {session.provider}</p>
              )}
            </TooltipContent>
          </Tooltip>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <Badge variant={status.variant} className="flex items-center gap-1 w-fit">
            {status.icon}
            {status.label}
          </Badge>
        </td>

        {/* Tokens */}
        <td className="px-4 py-3">
          <div className="flex flex-col text-sm">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="tabular-nums">
                  {formatTokens(session.tokens_total)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <div>Input: {formatTokens(session.tokens_input)}</div>
                  <div>Output: {formatTokens(session.tokens_output)}</div>
                  {session.tokens_cache_read !== null && (
                    <div>Cache Read: {formatTokens(session.tokens_cache_read)}</div>
                  )}
                  {session.tokens_cache_write !== null && (
                    <div>Cache Write: {formatTokens(session.tokens_cache_write)}</div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
            <span className="text-xs text-muted-foreground">
              in: {formatTokens(session.tokens_input)} / out: {formatTokens(session.tokens_output)}
            </span>
          </div>
        </td>

        {/* Duration */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 text-sm">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="tabular-nums">{duration}</span>
          </div>
        </td>

        {/* Started */}
        <td className="px-4 py-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm text-muted-foreground">
                {session.created_at
                  ? formatDistanceToNow(new Date(session.created_at), { addSuffix: true })
                  : 'Unknown'}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{session.created_at ? new Date(session.created_at).toLocaleString() : 'Unknown'}</p>
            </TooltipContent>
          </Tooltip>
        </td>
      </tr>
    </TooltipProvider>
  );
}
