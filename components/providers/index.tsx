'use client';

/**
 * Providers index - centralizes all context providers
 */

import React from 'react';
import { Toaster } from 'sonner';
import { ConvexProviderWrapper } from '@/lib/convex/provider';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ConvexProviderWrapper>
      {children}
      <Toaster 
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          },
        }}
      />
    </ConvexProviderWrapper>
  );
}
