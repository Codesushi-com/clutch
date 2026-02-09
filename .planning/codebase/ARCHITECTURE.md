# Architecture

**Analysis Date:** 2026-02-07

## Pattern Overview

**Overall:** Next.js App Router + Convex backend + background “work loop” orchestrator (Node process) bridging to an external OpenClaw gateway.

**Key Characteristics:**
- UI is built as client-heavy Next.js routes under `app/` and feature components under `components/`.
- Data is primarily stored and queried via Convex functions in `convex/`, consumed reactively in the UI via `convex/react` hooks.
- A separate long-running worker loop in `worker/` mutates Convex state (tasks, work loop state, audit logs) and manages agent sessions via a gateway WebSocket RPC client.

## Layers

**Routing / Pages (Next.js App Router):**
- Purpose: URL-to-screen mapping and route-level composition.
- Location: `app/`
- Contains: `page.tsx`, `layout.tsx`, route segments like `app/projects/[slug]/...`.
- Depends on: `components/`, `lib/hooks/`, `lib/stores/`, Next.js APIs.
- Used by: Next.js runtime.

**UI Components (feature + UI primitives):**
- Purpose: reusable UI and feature building blocks.
- Location: `components/`
- Contains:
  - Feature components (board/chat/sessions/work-loop): e.g. `components/board/board.tsx`, `components/chat/chat-thread.tsx`, `components/work-loop/work-loop-header-status.tsx`
  - UI primitives (shadcn-style): `components/ui/button.tsx`, `components/ui/dialog.tsx`, `components/ui/tabs.tsx`
- Depends on: `lib/hooks/`, `lib/stores/`, `lib/types`, `components/ui/*`.

**Client State (Zustand stores):**
- Purpose: client-side shared state (some legacy paths still use REST-ish Next API routes).
- Location: `lib/stores/`
- Examples: `lib/stores/task-store.ts`, `lib/stores/chat-store.ts`, `lib/stores/session-store.ts`, `lib/stores/project-store.ts`
- Depends on: `fetch("/api/..." )` in some stores (e.g. `lib/stores/task-store.ts`).

**Client Data Access (React hooks):**
- Purpose: typed, reactive data subscription to Convex + app-specific derivations.
- Location: `lib/hooks/`
- Examples:
  - Work loop state and runs: `lib/hooks/use-work-loop.ts` (queries `api.workLoop.*`)
  - Sessions derived from tasks: `lib/hooks/use-agent-sessions.ts` (queries `api.tasks.getAgentSessions` / `api.tasks.getAllAgentSessions`)
  - Convex message/chat sync: `lib/hooks/use-convex-messages.ts` consumed by `components/chat/convex-sync.tsx`

**Server HTTP API (Next.js route handlers):**
- Purpose: server-side endpoints for browser/client calls; mainly a thin wrapper over Convex, plus a proxy for OpenClaw RPC.
- Location: `app/api/**/route.ts`
- Patterns:
  - Convex proxy routes: `app/api/tasks/route.ts`, `app/api/projects/[id]/route.ts`, `app/api/gate/route.ts`
    - Uses server Convex client `lib/convex/server.ts` (`getConvexClient()` → `ConvexHttpClient`).
  - OpenClaw RPC proxy: `app/api/openclaw/rpc/route.ts` bridges HTTP → server-side WebSocket client `lib/openclaw/client.ts`.

**Data / Domain (Convex):**
- Purpose: persistent storage schema + query/mutation logic.
- Location: `convex/`
- Key files:
  - Schema: `convex/schema.ts`
  - Task APIs: `convex/tasks.ts`
  - Work loop APIs: `convex/workLoop.ts`
  - Additional modules: `convex/projects.ts`, `convex/comments.ts`, `convex/signals.ts`, `convex/gate.ts`, etc.
- Generated API types: `convex/_generated/*` (imported from app and worker via `@/convex/_generated/api`).

**Background Orchestration (Work Loop):**
- Purpose: continuously orchestrate agent work across projects by claiming tasks, spawning agents, and logging state.
- Location: `worker/`
- Entry/loop: `worker/loop.ts`
- Phases: `worker/phases/*.ts` (e.g. `worker/phases/work.ts`, `worker/phases/cleanup.ts`, `worker/phases/review.ts`, `worker/phases/analyze.ts`, `worker/phases/notify.ts`, `worker/phases/signals.ts`).
- Agent execution abstraction:
  - `worker/agent-manager.ts` (tracks active agent handles, reaps finished/stale sessions)
  - `worker/gateway-client.ts` (persistent WebSocket RPC to the OpenClaw gateway)
  - `worker/session-file-reader.ts` (inspects local JSONL session files to detect completion/staleness)

## Data Flow

**UI → Convex (reactive reads):**

1. `app/layout.tsx` wraps the app in `components/providers.tsx`.
2. `components/providers.tsx` mounts `lib/convex/provider.tsx` (`ConvexProviderWrapper`) and `components/session-provider.tsx`.
3. Hooks use `useQuery` from `convex/react` to subscribe to Convex functions, e.g. `lib/hooks/use-work-loop.ts` → `api.workLoop.getState`/`listRuns`/`getStats`.
4. Some features bridge Convex subscriptions into zustand for legacy component APIs:
   - `components/chat/convex-sync.tsx` subscribes via `lib/hooks/use-convex-messages.ts` and syncs into `lib/stores/chat-store.ts`.

**UI → Next API → Convex (server-side mutations/reads):**

1. Client calls Next route handlers under `app/api/**/route.ts`.
2. Route handler uses `lib/convex/server.ts` (`getConvexClient()`) to call Convex queries/mutations.
3. Example: `lib/stores/task-store.ts` calls `fetch('/api/tasks?...')` → `app/api/tasks/route.ts` → `convex/tasks.ts` (`api.tasks.getByProject`, `api.tasks.create`).

**UI → OpenClaw (proxy RPC):**

1. Client calls `openclawRpc()` in `lib/openclaw/rpc.ts`.
2. In browser, this hits `POST /api/openclaw/rpc` (relative URL).
3. `app/api/openclaw/rpc/route.ts` proxies to the persistent WS client in `lib/openclaw/client.ts` (`getOpenClawClient().rpc(...)`).

**Work Loop (worker) → Convex + OpenClaw:**

1. `worker/loop.ts` connects to Convex (`ConvexHttpClient`) and iterates enabled projects.
2. For each project, it runs phases (cleanup/notify/review/work/analyze), logging each step via `worker/logger.ts` → `convex/workLoop.ts`.
3. In `worker/phases/work.ts`, the loop queries ready tasks (`api.tasks.getByProject`), claims a task (`api.tasks.move`), then spawns an agent via `worker/agent-manager.ts` → `worker/gateway-client.ts` (`runAgent`).
4. Agent activity/finish is synced back into tasks via Convex mutations like `api.tasks.updateAgentActivity` and audit via `api.task_events.*` (see `convex/task_events.ts`).

## Key Abstractions

**Convex client split (server vs client):**
- Server-only HTTP client: `lib/convex/server.ts` (`getConvexClient()` returns a lazily-created `ConvexHttpClient`).
- Client React provider: `lib/convex/provider.tsx` (`ConvexProviderWrapper` creates a `ConvexReactClient` via `lib/convex/client.ts`).

**Work loop runtime + phase wrapper:**
- `worker/loop.ts` provides `runPhase(...)` to wrap each phase with:
  - start/end logging to Convex (`worker/logger.ts`)
  - error capture without crashing the process

**Agent session orchestration:**
- `worker/gateway-client.ts`: stable WebSocket RPC client with connect handshake and request tracking.
- `worker/agent-manager.ts`: spawns agent “handles”, tracks active sessions by task, reaps finished/stale agents by inspecting session JSONL files.
- `worker/phases/work.ts`: maps task role → model, builds prompts (`worker/prompts.ts`), claims and spawns.

**Context building for agents:**
- `lib/project-context.ts` reads key files from a project’s `local_path` (e.g. `AGENTS.md`, `README.md`) with size limits.
- `lib/dispatch/context.ts` builds the full task assignment context (task metadata + recent comments + cascaded project context).

**Reactive-to-store bridges (migration pattern):**
- Chat: `components/chat/convex-sync.tsx` syncs Convex queries into `lib/stores/chat-store.ts`.
- Sessions: `components/session-provider.tsx` mounts `components/convex-session-sync.tsx` (inner component uses Convex hooks and syncs to zustand session store).

## Entry Points

**Next.js application:**
- Root layout: `app/layout.tsx`
- Root page: `app/page.tsx` (client-only via `dynamic(..., { ssr: false })`)
- Project area layout: `app/projects/[slug]/layout.tsx`
- Example feature pages:
  - Board: `app/projects/[slug]/board/page.tsx`
  - Chat: `app/projects/[slug]/chat/page.tsx`
  - Work loop UI: `app/projects/[slug]/work-loop/page.tsx` and `app/work-loop/page.tsx`

**HTTP API surface (Next route handlers):**
- Tasks: `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`, `app/api/tasks/reorder/route.ts`
- Projects: `app/api/projects/route.ts`, `app/api/projects/[id]/route.ts`, `app/api/projects/[id]/context/route.ts`
- Work loop: `app/api/work-loop/state/route.ts`, `app/api/work-loop/config/route.ts`
- OpenClaw: `app/api/openclaw/rpc/route.ts`, `app/api/openclaw/status/route.ts`
- Gate/health: `app/api/gate/route.ts`

**Background worker / CLI:**
- Work loop process: `worker/loop.ts` (run standalone via `npx tsx worker/loop.ts`)
- CLI tool: `bin/clutch.ts` (registered as `clutch` bin in `package.json`)

## Error Handling

**Strategy:** Return JSON errors from route handlers; log to console for request-level issues; log work-loop actions/errors into Convex for audit.

**Patterns:**
- Next route handlers:
  - Validate inputs, return `NextResponse.json({ error: ... }, { status: 400 })` (e.g. `app/api/tasks/route.ts`).
  - `try/catch` around Convex calls, log via `console.error(...)`, return 500/502/503 (e.g. `app/api/openclaw/rpc/route.ts`).
- Worker:
  - Phase wrapper `runPhase(...)` in `worker/loop.ts` catches errors, writes an error run entry via `worker/logger.ts`, and continues the loop.

## Cross-Cutting Concerns

**Logging:**
- Work loop logs to Convex `workLoopRuns` via `worker/logger.ts` → `convex/workLoop.ts`.
- Route handlers use `console.*` (e.g. `app/api/gate/route.ts`, `app/api/tasks/route.ts`).

**Validation:**
- Mostly inline validation in Next route handlers (required params, allowed enums), e.g. `app/api/work-loop/state/route.ts`.
- Domain validation in Convex mutations (e.g. `convex/tasks.ts` validates title length and guards status transitions).

**Authentication:**
- OpenClaw access relies on tokens in env vars:
  - Server WS client uses `process.env.OPENCLAW_TOKEN` in `lib/openclaw/client.ts`.
  - Browser RPC uses `process.env.NEXT_PUBLIC_OPENCLAW_TOKEN` in `lib/openclaw/rpc.ts`.
- Convex access relies on `CONVEX_URL`/`NEXT_PUBLIC_CONVEX_URL` (see `lib/convex/server.ts`).

---

*Architecture analysis: 2026-02-07*
