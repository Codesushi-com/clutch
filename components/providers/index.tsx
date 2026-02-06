'use client';

/**
 * Providers index - centralizes all context providers
 */

import React from 'react';
import { ConvexProviderWrapper } from '@/lib/convex/provider';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ConvexProviderWrapper>
      {children}
    </ConvexProviderWrapper>
  );
}
