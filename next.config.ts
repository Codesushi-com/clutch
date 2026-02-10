import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev server access from anywhere (dev only)
  // These are hostnames, not full URLs
  allowedDevOrigins: [
    "192.168.7.200",
    "ada.codesushi.com",
  ],

  // Enable standalone output for Docker deployment
  output: 'standalone',

  // Instrumentation hook is enabled by default in Next.js 15+
  // The instrumentation.ts file will be auto-detected
};

export default nextConfig;
