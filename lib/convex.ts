'use client';

/**
 * Convex client setup for self-hosted deployment
 */

import { ConvexReactClient } from 'convex/react';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_SELF_HOSTED_URL;

if (!convexUrl) {
  throw new Error('NEXT_PUBLIC_CONVEX_SELF_HOSTED_URL is not set');
}

export const convex = new ConvexReactClient(convexUrl);
