"use client";

/**
 * Global Providers
 *
 * Wraps the app with all global context providers:
 * - ConvexProviderWrapper: Provides Convex React context (useQuery/useMutation)
 * - SessionProvider: Mounts the Convex session sync for reactive session data
 * - Toaster: Global toast UI
 */

import React from "react";
import { Toaster } from "sonner";
import { SessionProvider } from "@/components/session-provider";
import { ConvexProviderWrapper } from "@/lib/convex/provider";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ConvexProviderWrapper>
      <SessionProvider>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            },
          }}
        />
      </SessionProvider>
    </ConvexProviderWrapper>
  );
}
