# Codebase Structure

**Analysis Date:** 2026-02-07

## Directory Layout

```
[project-root]/
├── app/                 # Next.js App Router routes (pages/layouts) + Next route handlers under app/api/
│   ├── api/             # HTTP API endpoints (route.ts) that proxy to Convex and OpenClaw
│   ├── projects/        # Project-scoped UI routes under /projects/[slug]/...
│   └── ...              # Other top-level routes (agents, sessions, prompts, settings, work-loop)
├── components/          # React UI + feature components (organized by feature)
│   ├── ui/              # Shared UI primitives (button, dialog, tabs, etc.)
│   ├── board/           # Kanban board feature components
│   ├── chat/            # Chat feature components + Convex-to-store sync
│   ├── layout/          # App/project layouts and navigation components
│   ├── sessions/        # Session and transcript UI
│   └── work-loop/       # Work-loop UI widgets
├── convex/              # Convex schema + query/mutation modules (backend datastore)
│   └── _generated/      # Generated Convex API/types (imported by app + worker)
├── lib/                 # Shared app logic: hooks, stores, API clients, types, utilities
│   ├── hooks/           # React hooks (Convex subscriptions, derived data)
│   ├── stores/          # Zustand stores (client state)
│   ├── convex/          # Convex client helpers (client provider + server HTTP client)
│   ├── openclaw/        # OpenClaw RPC client + server WS client
│   ├── dispatch/        # Context builders for spawning agents
│   └── types/           # Type definitions grouped by domain
├── worker/              # Background work-loop process + gateway client + phases
│   └── phases/          # Phase implementations (work/review/analyze/cleanup/notify/signals)
├── bin/                 # Executables (e.g., clutch CLI)
├── plugins/             # Optional plugin integrations (excluded from TS project build)
├── test/                # Vitest tests + setup
├── public/              # Static assets served by Next.js
├── docs/                # Product/ops docs
└── .planning/           # Planning artifacts (including these codebase maps)
```

## Directory Purposes

**`app/`:**
- Purpose: Next.js App Router routes, layouts, and server route handlers.
- Contains:
  - Root layout: `app/layout.tsx`
  - Root page: `app/page.tsx`
  - Project area: `app/projects/[slug]/layout.tsx`, `app/projects/[slug]/board/page.tsx`, `app/projects/[slug]/chat/page.tsx`
  - API routes: `app/api/**/route.ts` (e.g. `app/api/tasks/route.ts`, `app/api/openclaw/rpc/route.ts`)

**`components/`:**
- Purpose: shared UI and feature components.
- Contains:
  - Global providers: `components/providers.tsx`, `components/session-provider.tsx`
  - Feature areas:
    - Board: `components/board/board.tsx`, `components/board/task-modal.tsx`
    - Chat: `components/chat/chat-thread.tsx`, `components/chat/convex-sync.tsx`
    - Layout: `components/layout/main-layout.tsx`, `components/layout/sidebar.tsx`
    - Sessions: `components/sessions/transcript-viewer.tsx`
  - UI primitives: `components/ui/button.tsx`, `components/ui/dialog.tsx`, `components/ui/tabs.tsx`

**`lib/`:**
- Purpose: non-UI logic shared across routes/components.
- Contains:
  - Convex clients:
    - Server client: `lib/convex/server.ts`
    - React provider: `lib/convex/provider.tsx`
  - Convex reactive hooks: `lib/hooks/use-work-loop.ts`, `lib/hooks/use-agent-sessions.ts`
  - Zustand stores: `lib/stores/task-store.ts`, `lib/stores/chat-store.ts`
  - OpenClaw clients:
    - HTTP RPC wrapper: `lib/openclaw/rpc.ts`
    - Server WS client singleton: `lib/openclaw/client.ts`
  - Agent context building:
    - Project context: `lib/project-context.ts`
    - Task dispatch context: `lib/dispatch/context.ts`
  - Types: `lib/types.ts`, `lib/types/work-loop.ts`, `lib/types/session.ts`

**`convex/`:**
- Purpose: Convex backend (schema + queries + mutations).
- Key files:
  - `convex/schema.ts`
  - `convex/tasks.ts`
  - `convex/workLoop.ts`
- Generated API/types:
  - `convex/_generated/api.js`, `convex/_generated/api.d.ts` (imported as `api` from `@/convex/_generated/api`).

**`worker/`:**
- Purpose: long-running orchestration process (“work loop”).
- Key files:
  - Loop: `worker/loop.ts`
  - Phase implementations: `worker/phases/work.ts`, `worker/phases/review.ts`, `worker/phases/analyze.ts`
  - Agent execution: `worker/agent-manager.ts`, `worker/gateway-client.ts`
  - Logging: `worker/logger.ts`
  - Work loop config: `worker/config.ts`

**`bin/`:**
- Purpose: executable entry points.
- Key files: `bin/clutch.ts` (registered as `clutch` in `package.json`).

**`plugins/`:**
- Purpose: optional plugin integrations.
- Key files: `plugins/clutch-channel.ts`, `plugins/clutch-signal.ts`.
- Note: excluded from main TS config (`tsconfig.json` excludes `plugins`).

**`test/`:**
- Purpose: unit/integration tests under Vitest.
- Key files: `test/setup.ts`, `test/role-selector.test.tsx`.

## Key File Locations

**Entry Points:**
- `app/layout.tsx`: root HTML shell + providers.
- `app/page.tsx`: root page (client-only wrapper for `app/home-content.tsx`).
- `worker/loop.ts`: work-loop process entry (standalone or imported).
- `bin/clutch.ts`: CLI entry.

**Configuration:**
- `next.config.ts`: Next.js config.
- `tsconfig.json`: TS config + `@/*` alias mapping to project root.
- `eslint.config.mjs`: ESLint config.
- `vitest.config.ts`: Vitest config.
- `worker/tsconfig.json`: NodeNext TS config for worker code.

**Core Logic:**
- Convex backend: `convex/*.ts` (schema + query/mutation modules).
- Work loop orchestration: `worker/loop.ts` + `worker/phases/*.ts`.
- OpenClaw integration: `lib/openclaw/*` + `app/api/openclaw/*`.

**Testing:**
- Tests: `test/*.test.tsx`.

## Naming Conventions

**Files (Next.js routes):**
- App Router route entrypoints:
  - `app/**/page.tsx`
  - `app/**/layout.tsx`
  - API handlers: `app/api/**/route.ts`

**Files (React components):**
- Feature components use kebab-case filenames: e.g. `components/board/task-modal.tsx`, `components/chat/chat-thread.tsx`.
- UI primitives live in `components/ui/*.tsx` with kebab-case names: e.g. `components/ui/dropdown-menu.tsx`.

**Files (hooks and utilities):**
- Hooks are named `use-*.ts`: e.g. `lib/hooks/use-work-loop.ts`, `lib/hooks/use-agent-sessions.ts`.
- Utilities use simple module names: `lib/utils.ts`, `lib/utils/uuid.ts`.

## Where to Add New Code

**New feature page (UI):**
- Primary route: add under `app/` (prefer project-scoped routes under `app/projects/[slug]/<feature>/page.tsx`).
- Shared/feature components: add under `components/<feature>/`.
- Data subscriptions/derivations: add a hook under `lib/hooks/` (prefer Convex `useQuery` patterns as in `lib/hooks/use-work-loop.ts`).

**New HTTP API endpoint:**
- Add a Next route handler under `app/api/<name>/route.ts`.
- For Convex access from route handlers, use `lib/convex/server.ts` (`getConvexClient()`) and call `api.*` from `@/convex/_generated/api`.

**New datastore capability (Convex):**
- Schema: update `convex/schema.ts`.
- Add queries/mutations in a new or existing Convex module under `convex/<domain>.ts`.
- Consume via generated `api` imports (`@/convex/_generated/api`) from UI hooks (`lib/hooks/*`) or route handlers (`app/api/*`).

**New work-loop behavior:**
- Add/update a phase in `worker/phases/` and wire it into `worker/loop.ts`.
- If agent spawning/monitoring changes are needed, implement in `worker/agent-manager.ts` or `worker/gateway-client.ts`.

## Special Directories

**`convex/_generated/`:**
- Purpose: generated Convex client/server typings and helpers.
- Generated: Yes.
- Committed: Yes (present as `convex/_generated/api.js`, `convex/_generated/api.d.ts`, etc.).

**`.next/`:**
- Purpose: Next.js build output and dev artifacts.
- Generated: Yes.
- Committed: No (build artifact).

**`.planning/`:**
- Purpose: AI planning/mapping artifacts.
- Generated: Mixed.
- Committed: Yes (this repository uses `.planning/codebase/` for reference docs).

---

*Structure analysis: 2026-02-07*
