import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev server access from additional origins (dev only)
  // These are hostnames, not full URLs
  // Configure via NEXT_PUBLIC_DEV_ORIGINS env var (comma-separated)
  // Example: NEXT_PUBLIC_DEV_ORIGINS=192.168.1.100,mydomain.com
  allowedDevOrigins: process.env.NEXT_PUBLIC_DEV_ORIGINS
    ? process.env.NEXT_PUBLIC_DEV_ORIGINS.split(",").map(s => s.trim())
    : [],

  // Enable standalone output for Docker deployment
  output: 'standalone',

  // Instrumentation hook is enabled by default in Next.js 15+
  // The instrumentation.ts file will be auto-detected
};

export default nextConfig;
