# Coding Conventions

**Analysis Date:** 2026-02-08

## Naming Patterns

**Files:**
- Use **kebab-case** for most TS/TSX files.
  - Examples: `components/board/create-task-modal.tsx`, `components/session-provider.tsx`, `lib/hooks/use-session-status.ts`, `lib/stores/task-store.ts`
- Use `use-*.ts` for React hooks.
  - Examples: `lib/hooks/use-work-loop.ts`, `lib/hooks/use-dependencies.ts`
- Use `*-store.ts` for Zustand stores.
  - Examples: `lib/stores/chat-store.ts`, `lib/stores/session-store.ts`
- Tests use `*.test.ts` / `*.test.tsx`.
  - Examples: `test/role-selector.test.tsx`, `worker/children.test.ts`

**Functions:**
- React components: **PascalCase**.
  - Examples: `CreateTaskModal` in `components/board/create-task-modal.tsx`, `Providers` in `components/providers.tsx`
- Hooks: **camelCase** prefixed with `use`.
  - Examples: `useWorkLoopState` / `useActiveAgentCount` in `lib/hooks/use-work-loop.ts`
- Helpers/utilities: **camelCase**.
  - Examples: `cn` in `lib/utils.ts`, `parseSlashCommand` in `lib/slash-commands.ts`

**Variables:**
- Local variables: **camelCase**.
  - Example: `projectId`, `searchParams` in `app/api/chats/route.ts`
- Constants: **UPPER_SNAKE_CASE**.
  - Examples: `API_BASE_URL` in `lib/api/client.ts`, `PRIORITIES` / `ROLES` in `components/board/create-task-modal.tsx`

**Types:**
- Types/interfaces: **PascalCase**.
  - Examples: `Task`, `Project`, `TaskRole` in `lib/types/index.ts`
- Union string enums: `type X = "a" | "b"`.
  - Examples: `TaskStatus`, `DispatchStatus` in `lib/types/index.ts`

## Code Style

**Formatting:**
- Not enforced by a dedicated formatter config.
  - Prettier is present as a transitive dependency (see `pnpm-lock.yaml`), but there is **no** `.prettierrc` / `prettier.config.*` and no `format` script in `package.json`.
- The codebase contains mixed styles (semicolon + single/double quotes), so prefer **matching the surrounding file’s style**.
  - No-semicolon style appears frequently in client components/hooks (e.g. `lib/hooks/use-work-loop.ts`, `components/board/create-task-modal.tsx`).
  - Semicolon style appears in some app/components files (e.g. `app/layout.tsx`, `components/providers.tsx`).

**Linting:**
- ESLint is configured via flat config at `eslint.config.mjs`.
- Base rules come from Next.js presets:
  - `eslint-config-next/core-web-vitals`
  - `eslint-config-next/typescript`
- Pre-commit runs TypeScript and ESLint:
  - Hook: `.husky/pre-commit` runs `pnpm exec tsc --noEmit` then `pnpm lint`.

## Import Organization

**Order:**
1. External packages
2. Internal imports using the `@/` alias
3. Relative imports (common in `worker/`)

Examples:
- External + internal alias: `app/api/chats/route.ts`
- External + internal + types: `lib/stores/task-store.ts` (`import type { ... } from "@/lib/types"`)
- Worker uses relative imports: `worker/loop.ts` (`./config`, `../convex/_generated/api`)

**Path Aliases:**
- Use `@/` as a root alias.
  - TypeScript: `tsconfig.json` (`"paths": { "@/*": ["./*"] }`)
  - Vitest: `vitest.config.ts` (`resolve.alias['@'] = path.resolve(__dirname, './')`)

**Type-only imports:**
- Prefer `import type` for types.
  - Examples: `lib/hooks/use-work-loop.ts`, `lib/stores/task-store.ts`, `worker/children.test.ts`

## Error Handling

**API Routes (Next.js route handlers):**
- Validate required inputs early and return structured JSON + status.
  - Example: missing `projectId` returns 400 in `app/api/chats/route.ts`.
- Wrap handler logic in `try/catch`, log with a tagged prefix, return 500 on failure.
  - Example: `console.error("[Chats API] ...", error)` in `app/api/chats/route.ts`.
- When re-throwing/propagating errors, normalize message:
  - Example: `const message = error instanceof Error ? error.message : "..."` in `app/api/chats/route.ts`.

**Client fetch wrappers / stores:**
- On non-2xx responses:
  1. Try to read `{ error | message }` JSON
  2. Throw `new Error(...)`
  - Examples: `lib/stores/task-store.ts`, `lib/api/client.ts`, `lib/hooks/use-session-status.ts`
- Zustand stores commonly:
  - set `{ loading: true, error: null }` before the request
  - update state on success
  - set `error` + throw on failure
  - Example pattern: `lib/stores/chat-store.ts`, `lib/stores/task-store.ts`

**Worker/runtime:**
- Errors are caught and logged; logging failures should not break main flow.
  - Example: `worker/logger.ts` catches Convex logging failures and logs to `console.error`.

## Logging

**Framework:**
- Use `console.*` with a bracketed component tag.
  - Examples: `console.error("[Chats API] ...")` in `app/api/chats/route.ts`, `console.warn("[WorkLoop] ...")` in `worker/loop.ts`, `console.error("[Logger] ...")` in `worker/logger.ts`.

**Patterns:**
- Convert unknown errors to strings safely.
  - Example: `error instanceof Error ? error.message : String(error)` in `worker/logger.ts`.

## Comments

**When to Comment:**
- Use JSDoc blocks to document exported hooks/utilities and non-obvious behavior.
  - Examples: `lib/hooks/use-work-loop.ts`, `worker/logger.ts`.
- Use short inline comments for behavioral notes and non-fatal error handling.
  - Example: non-fatal warnings + continue in `worker/loop.ts`.

**JSDoc/TSDoc:**
- Common for exported functions and modules.
  - Examples: `lib/slash-commands.ts`, `worker/logger.ts`, `components/providers.tsx`.

## Function Design

**Size:**
- Prefer small, single-purpose hooks/functions; group related hook returns in a single object.
  - Example: `useWorkLoopState` returns `{ state, isLoading, error }` in `lib/hooks/use-work-loop.ts`.

**Parameters:**
- Prefer explicit parameter objects when an API has optional fields.
  - Example: `logRun(convex, params)` with `LogRunParams` in `worker/logger.ts`.

**Return Values:**
- Hooks: return a stable object shape with `isLoading`/`error` even when data is `null`.
  - Examples: `lib/hooks/use-work-loop.ts`, `lib/hooks/use-session-status.ts`.

## Module Design

**Exports:**
- Prefer named exports for components/hooks/utilities.
  - Examples: `components/board/create-task-modal.tsx`, `lib/hooks/use-session-status.ts`.
- Use default exports for Next.js route segment entrypoints.
  - Examples: `app/layout.tsx`, `app/page.tsx`.

**Barrel Files:**
- Types are centralized and re-exported via `lib/types/index.ts`.
  - Prefer importing shared types from `@/lib/types`.

---

*Convention analysis: 2026-02-08*
