"use client";

/**
 * Global Providers
 *
 * Wraps the app with all global context providers:
 * - SessionProvider: Manages the single session poller
 */

import { SessionProvider } from "@/components/session-provider";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider refreshIntervalMs={30000}>
      {children}
    </SessionProvider>
  );
}
