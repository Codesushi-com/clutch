import type { UserWorkspaceConfig } from 'vitest/config'

const defaultProject: UserWorkspaceConfig = {
  test: {
    name: 'default',
    environment: 'jsdom',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.next-staging/**',
      '**/convex/**/*.test.ts',
      '**/test/convex/**/*.test.ts',
    ],
  },
}

const convexProject: UserWorkspaceConfig = {
  test: {
    name: 'convex',
    environment: '@edge-runtime/vm',
    include: [
      '**/convex/**/*.test.ts',
      '**/test/convex/**/*.test.ts',
    ],
  },
}

export default [defaultProject, convexProject]
