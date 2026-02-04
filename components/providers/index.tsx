'use client';

/**
 * Providers index - centralizes all context providers
 */

import React from 'react';
import { WebSocketProvider } from './websocket-provider';
import { OpenClawWSProvider } from '@/lib/providers/openclaw-ws-provider';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <WebSocketProvider>
      <OpenClawWSProvider>
        {children}
      </OpenClawWSProvider>
    </WebSocketProvider>
  );
}

// Re-export individual providers for specific use cases
export { WebSocketProvider } from './websocket-provider';
export { OpenClawWSProvider, useOpenClawWS } from '@/lib/providers/openclaw-ws-provider';