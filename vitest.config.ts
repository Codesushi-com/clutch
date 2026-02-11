import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    environmentMatchGlobs: [
      // convex-test tests need edge-runtime environment
      ['**/convex/**/*.test.ts', '@edge-runtime/vm'],
      ['**/test/convex/**/*.test.ts', '@edge-runtime/vm'],
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
