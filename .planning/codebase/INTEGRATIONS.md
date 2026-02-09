# External Integrations

**Analysis Date:** 2026-02-07

## APIs & External Services

**Realtime backend / database:**
- Convex (self-hosted or remote URL) - primary data store + realtime queries/mutations
  - SDK/Client: `convex` (see `lib/convex/server.ts`, `lib/convex/client.ts`, `convex/**`)
  - Auth: Not detected in this repo (Convex URL configured via env vars)

**Agent gateway / orchestration:**
- OpenClaw Gateway - WebSocket RPC and session management
  - SDK/Client:
    - WS client (Node): `ws` via `lib/openclaw/client.ts` and `worker/gateway-client.ts`
    - HTTP-to-WS proxy route: `app/api/openclaw/rpc/route.ts`
    - HTTP RPC helper used by UI: `lib/openclaw/rpc.ts` (calls `/api/openclaw/rpc` in browser)
  - Auth:
    - `OPENCLAW_TOKEN` (server/worker WS auth) used in `lib/openclaw/client.ts`, `worker/gateway-client.ts`
    - `NEXT_PUBLIC_OPENCLAW_TOKEN` (browser-side Authorization header for RPC proxy) used in `lib/openclaw/rpc.ts`

**GitHub:**
- GitHub public REST API - repo validation endpoint
  - Implementation: `app/api/validate/github/route.ts` (calls `https://api.github.com/repos/:owner/:repo`)
  - Auth: none (unauthenticated; subject to rate limiting)

**Browser automation / tab control:**
- Local browser control server - closes stale Chromium tabs
  - Implementation: `worker/phases/cleanup.ts` (calls `http://127.0.0.1:18791/api/tabs` and `http://127.0.0.1:18791/api/close`)
- agent-browser (CLI) - QA smoke test script
  - Implementation: `scripts/qa-smoke-agent-browser.sh` (runs `npx -y agent-browser ...`)

## Data Storage

**Databases:**
- Convex
  - Connection: `CONVEX_URL` / `NEXT_PUBLIC_CONVEX_URL` (server/client URL) used in `lib/convex/server.ts`, `lib/convex/client.ts`
  - Alternate connection path: `CONVEX_SELF_HOSTED_URL` / `NEXT_PUBLIC_CONVEX_SELF_HOSTED_URL` used in `lib/convex-server.ts`
  - Client: `ConvexHttpClient` / `ConvexReactClient` (`lib/convex/server.ts`, `lib/convex/client.ts`)

**File Storage:**
- Local filesystem (committed `public/` plus runtime uploads)
  - Upload endpoint: `app/api/upload/image/route.ts` (writes to `public/uploads/images/**`)
  - Serve uploaded files: `app/uploads/images/[...path]/route.ts` (reads from `public/uploads/images/**`)

**Caching:**
- None detected (no Redis/memcached; caching relies on default Next.js behavior and HTTP headers like in `app/uploads/images/[...path]/route.ts`).

## Authentication & Identity

**Auth Provider:**
- Not detected (no NextAuth/Clerk/Auth0/etc in `package.json`; no auth middleware detected).

**Service-to-service tokens:**
- OpenClaw tokens used as Bearer auth headers / handshake tokens:
  - `OPENCLAW_TOKEN` (server/worker) in `lib/openclaw/client.ts`, `worker/gateway-client.ts`
  - `NEXT_PUBLIC_OPENCLAW_TOKEN` (browser RPC proxy) in `lib/openclaw/rpc.ts`

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry/etc in `package.json`; logging uses `console.*` across server/worker code)

**Logs:**
- Next.js server logs: stdout/stderr (managed by `run.sh` into `/tmp/clutch-prod.log`)
- Worker logs: stdout/stderr (managed by `run.sh` into `/tmp/clutch-loop.log` and `/tmp/clutch-bridge.log`)

## CI/CD & Deployment

**Hosting:**
- Self-hosted Next.js server (process manager shell script)
  - Start/stop orchestration: `run.sh` (builds with `pnpm build`, runs `next start`, runs `worker/loop.ts` and `worker/chat-bridge.ts`)
- Reverse proxy for HTTPS + WebSockets described in `README.md` (nginx proxying `/openclaw-ws`)

**CI Pipeline:**
- Not detected (no `.github/workflows/**`, no CI config files found)

## Environment Configuration

**Required env vars:**
- Convex:
  - `CONVEX_URL` (server/worker Convex HTTP client) used in `lib/convex/server.ts`, `worker/loop.ts`, `worker/chat-bridge.ts`, `bin/clutch.ts`
  - `NEXT_PUBLIC_CONVEX_URL` (browser Convex React client) used in `lib/convex/client.ts`
  - `CONVEX_SELF_HOSTED_URL` / `NEXT_PUBLIC_CONVEX_SELF_HOSTED_URL` (alternate Convex config) used in `lib/convex-server.ts`
- OpenClaw:
  - `OPENCLAW_WS_URL` (gateway WS URL) used in `lib/openclaw/client.ts`, `worker/gateway-client.ts`, `app/api/openclaw/status/route.ts`
  - `OPENCLAW_TOKEN` (gateway token) used in `lib/openclaw/client.ts`, `worker/gateway-client.ts`
  - `NEXT_PUBLIC_OPENCLAW_HTTP_URL` (optional override for HTTP RPC base) used in `lib/openclaw/rpc.ts`
  - `OPENCLAW_HOST` / `OPENCLAW_PORT` (server-side host/port composition) used in `lib/openclaw/rpc.ts`
  - `NEXT_PUBLIC_OPENCLAW_TOKEN` (browser Authorization header for RPC proxy) used in `lib/openclaw/rpc.ts`
  - `NEXT_PUBLIC_OPENCLAW_API_URL` (OpenClaw REST API base) used in `lib/api/client.ts`
- Work loop:
  - `WORK_LOOP_ENABLED`, `WORK_LOOP_CYCLE_MS`, `WORK_LOOP_MAX_AGENTS_PER_PROJECT`, `WORK_LOOP_MAX_AGENTS`, `WORK_LOOP_MAX_DEV_AGENTS`, `WORK_LOOP_MAX_REVIEWER_AGENTS`, `WORK_LOOP_STALE_TASK_MINUTES`, `WORK_LOOP_STALE_REVIEW_MINUTES` used in `worker/config.ts`
- OpenClutch (used by OpenClaw plugins / scripts):
  - `CLUTCH_URL` (base URL for OpenClutch) used in `plugins/clutch-signal.ts`, `bin/clutch-gate.sh`, `scripts/qa-smoke-agent-browser.sh`
  - `CLUTCH_API_URL` (alternate name) used in `plugins/clutch-channel.ts`

**Secrets location:**
- Local development uses `.env.local` (loaded by `run.sh`; referenced in `README.md`).
- OpenClaw plugin environment uses OpenClaw config env (`plugins/clutch-channel.ts` reads `api.config.env`).

## Webhooks & Callbacks

**Incoming:**
- OpenClaw → OpenClutch (plugin callbacks via HTTP POST):
  - Persist assistant responses: `plugins/clutch-channel.ts` → `POST /api/chats/:chatId/messages` (implemented by `app/api/chats/[id]/messages/route.ts`)
  - Typing indicator updates: `plugins/clutch-channel.ts` → `POST /api/chats/:chatId/typing` (implemented by `app/api/chats/[id]/typing/route.ts`)
  - Agent signals and completion: `plugins/clutch-signal.ts` → `POST /api/signal` and `POST /api/tasks/:id/complete` (implemented by `app/api/signal/route.ts`, `app/api/tasks/[id]/complete/route.ts`)

**Outgoing:**
- OpenClutch → GitHub public API for repo validation: `app/api/validate/github/route.ts`
- OpenClutch → OpenClaw gateway WS RPC via proxy: `app/api/openclaw/rpc/route.ts` → `lib/openclaw/client.ts`

---

*Integration audit: 2026-02-07*
