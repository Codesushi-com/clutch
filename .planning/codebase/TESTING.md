# Testing Patterns

**Analysis Date:** 2026-02-08

## Test Framework

**Runner:**
- Vitest `^4.0.18`
- Config: `vitest.config.ts`

**Assertion Library:**
- Vitest `expect`
- DOM matchers: `@testing-library/jest-dom` via `test/setup.ts`

**Run Commands:**
```bash
pnpm test           # Run all tests (package.json)
pnpm test:ui        # Vitest UI (package.json)
```

## Test File Organization

**Location:**
- Mixed approach:
  - Central `test/` directory for UI/feature tests: `test/role-selector.test.tsx`
  - Co-located tests for worker code: `worker/children.test.ts`

**Naming:**
- `*.test.tsx` for React tests (example: `test/role-selector.test.tsx`)
- `*.test.ts` for Node/worker tests (example: `worker/children.test.ts`)

**Structure:**
```
test/
  setup.ts
  *.test.tsx
worker/
  *.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Feature/Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does something', async () => {
    // arrange
    // act
    // assert
  })
})
```

Concrete examples:
- Nested describes and shared setup in `test/role-selector.test.tsx`.
- `beforeEach`/`afterEach` for timer control in `worker/children.test.ts`.

**Patterns:**
- Setup uses `beforeEach` for resetting mocks and initializing state.
  - `vi.clearAllMocks()` in `test/role-selector.test.tsx`.
- Worker tests often use `vi.useFakeTimers()` / `vi.useRealTimers()`.
  - `worker/children.test.ts`.

## Mocking

**Framework:**
- Vitest mocks via `vi.mock`, `vi.fn`, fake timers.

**Patterns:**
```typescript
vi.mock('@/lib/stores/task-store', () => ({
  useTaskStore: () => ({ createTask: vi.fn() })
}))
```

Concrete examples:
- Mock internal modules with `@/` alias in `test/role-selector.test.tsx`:
  - `vi.mock('@/lib/stores/task-store', ...)`
  - `vi.mock('@/lib/hooks/use-dependencies', ...)`
  - `vi.mock('@/lib/hooks/use-session-status', ...)`
- Mock Node built-ins using dynamic import mocking in `worker/children.test.ts`:
  - `vi.mock(import('node:child_process'), async (importOriginal) => { ... })`

**What to Mock:**
- External effects (network, child processes, shared stores).
  - `global.fetch = vi.fn().mockResolvedValue(...)` in `test/role-selector.test.tsx`.

**What NOT to Mock:**
- Prefer testing pure UI rendering and state transitions directly when practical.
  - Example: role dropdown interactions are tested via DOM in `test/role-selector.test.tsx`.

## Fixtures and Factories

**Test Data:**
- Use local helper functions to create typed fixtures.
```typescript
const createMockTask = (role: string | null): Task => ({
  id: 'test-task-id',
  // ...
  role: role as Task['role'],
})
```
  - Example: `createMockTask` in `test/role-selector.test.tsx`.

**Location:**
- Fixtures are defined inline in the test file (no shared fixtures directory detected).

## Coverage

**Requirements:**
- None enforced / not configured.
- No coverage script or Vitest coverage config detected in `package.json` or `vitest.config.ts`.

## Test Types

**Unit Tests:**
- Node/worker unit tests validate internal behavior via mocks.
  - Example: process spawning and lifecycle handling in `worker/children.test.ts`.

**Integration Tests:**
- React component tests exercise UI behavior with selective mocking.
  - Example: role selector behavior across components in `test/role-selector.test.tsx`.

**E2E Tests:**
- Not detected (no Playwright/Cypress config files present).

## Common Patterns

**Async Testing:**
- Use `async` tests and `await` where needed.
  - Example: async assertions around DOM selection in `test/role-selector.test.tsx`.

**Error Testing:**
- Use `toThrow(...)` for synchronous error paths.
  - Example: spawn failure throws in `worker/children.test.ts` (`toThrow('Failed to spawn ...')`).

---

*Testing analysis: 2026-02-08*
