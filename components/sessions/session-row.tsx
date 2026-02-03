'use client';

/**
 * Session Row Component
 * Individual row displaying session information
 */

import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Pause, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import { Session, SessionStatus } from '@/lib/types';
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
  running: {
    label: 'Running',
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
  error: {
    label: 'Error',
    variant: 'destructive',
    icon: <XCircle className="h-3 w-3" />,
  },
  cancelled: {
    label: 'Cancelled',
    variant: 'outline',
    icon: <XCircle className="h-3 w-3" />,
  },
};

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

export function SessionRow({ session }: SessionRowProps) {
  const router = useRouter();
  const status = statusConfig[session.status];
  const duration = formatDuration(session.createdAt, session.completedAt);
  
  const handleClick = () => {
    router.push(`/sessions/${session.id}`);
  };

  return (
    <TooltipProvider>
      <tr
        onClick={handleClick}
        className="cursor-pointer transition-colors hover:bg-muted/50 border-b"
      >
        {/* Session Name & Type */}
        <td className="px-4 py-3">
          <div className="flex flex-col">
            <span className="font-medium text-sm">{session.name}</span>
            <span className="text-xs text-muted-foreground capitalize">
              {session.type}
              {session.parentId && (
                <span className="ml-1">(child of {session.parentId.slice(0, 8)}...)</span>
              )}
            </span>
          </div>
        </td>

        {/* Model */}
        <td className="px-4 py-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm truncate max-w-[150px] inline-block">
                {session.model}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{session.model}</p>
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
                  {formatTokens(session.tokens.total)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <div>Input: {formatTokens(session.tokens.input)}</div>
                  <div>Output: {formatTokens(session.tokens.output)}</div>
                </div>
              </TooltipContent>
            </Tooltip>
            <span className="text-xs text-muted-foreground">
              in: {formatTokens(session.tokens.input)} / out: {formatTokens(session.tokens.output)}
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
                {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{new Date(session.createdAt).toLocaleString()}</p>
            </TooltipContent>
          </Tooltip>
        </td>
      </tr>
    </TooltipProvider>
  );
}
