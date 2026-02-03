"use client";

import { useWebSocket } from '@/hooks/useWebSocket';

interface ConnectionStatusProps {
  websocketUrl?: string;
}

export function ConnectionStatus({ websocketUrl = 'ws://localhost:8080' }: ConnectionStatusProps) {
  const { state } = useWebSocket({ url: websocketUrl });

  const getStatusColor = () => {
    switch (state.status) {
      case 'connected':
        return 'bg-green-500';
      case 'disconnected':
        return 'bg-red-500';
      case 'reconnecting':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (state.status) {
      case 'connected':
        return 'Connected';
      case 'disconnected':
        return 'Disconnected';
      case 'reconnecting':
        return `Reconnecting (${state.reconnectAttempt})`;
      default:
        return 'Unknown';
    }
  };

  const formatUptime = (ms: number) => {
    if (ms === 0) return '0s';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getTooltipContent = () => {
    const lines = [
      `Status: ${getStatusText()}`,
      `URL: ${state.url}`,
    ];
    
    if (state.status === 'connected') {
      lines.push(`Uptime: ${formatUptime(state.uptime)}`);
    }
    
    if (state.status === 'reconnecting') {
      lines.push(`Attempt: ${state.reconnectAttempt}`);
    }
    
    if (state.lastError) {
      lines.push(`Last Error: ${state.lastError}`);
    }
    
    return lines.join('\n');
  };

  const isReconnecting = state.status === 'reconnecting';

  return (
    <div className="flex items-center gap-2">
      <div
        className={`
          w-2 h-2 rounded-full transition-all duration-200
          ${getStatusColor()}
          ${isReconnecting ? 'animate-pulse' : ''}
        `}
        title={getTooltipContent()}
      />
      <span className="text-xs text-gray-600 dark:text-gray-400 hidden sm:inline">
        {getStatusText()}
      </span>
    </div>
  );
}