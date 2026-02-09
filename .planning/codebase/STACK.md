# Technology Stack

**Analysis Date:** 2026-02-07

## Languages

**Primary:**
- TypeScript (TS/TSX) - Application code in `app/**`, `components/**`, `lib/**`, `worker/**`, `convex/**`, `bin/clutch.ts`

**Secondary:**
- CSS - Global styles in `app/globals.css` (Tailwind v4 + tw-animate)
- Shell (bash/sh) - Ops scripts in `run.sh`, `bin/clutch-gate.sh`, `scripts/qa-smoke-agent-browser.sh`

## Runtime

**Environment:**
- Node.js 22.22.0 (Volta-pinned) - configured in `package.json` (`volta.node`)

**Package Manager:**
- pnpm 10.28.2 (Volta-pinned) - configured in `package.json` (`volta.pnpm`)
- Lockfile: present (`pnpm-lock.yaml`)

## Frameworks

**Core:**
- Next.js 16.1.6 - App Router UI + API routes in `app/**` and `app/api/**` (dependency in `package.json`)
- React 19.2.3 - UI rendering (dependency in `package.json`)
- Convex 1.31.7 - realtime backend/data layer (schema + functions in `convex/**`, clients in `lib/convex/**`)

**Testing:**
- Vitest ^4.0.18 - test runner configured in `vitest.config.ts`
- Testing Library React ^16.3.2 + jest-dom ^6.9.1 - DOM assertions and helpers (`test/setup.ts`)
- jsdom ^28.0.0 - browser-like test environment (`vitest.config.ts`)

**Build/Dev:**
- Next dev/build/start - scripts in `package.json` (`dev`, `build`, `start`)
- TypeScript ^5 - typechecking via `pnpm typecheck` (`package.json`)
- ESLint ^9 + `eslint-config-next` 16.1.6 - linting via `pnpm lint` (`eslint.config.mjs`)
- PostCSS + `@tailwindcss/postcss` - Tailwind processing configured in `postcss.config.mjs`
- Husky - git hooks (`.husky/pre-commit`)

## Key Dependencies

**Critical:**
- `convex` ^1.31.7 - database/realtime sync; server client in `lib/convex/server.ts`, browser client in `lib/convex/client.ts`, schema in `convex/schema.ts`
- `ws` ^8.19.0 - Node WebSocket client for OpenClaw gateway integration (`lib/openclaw/client.ts`, `worker/gateway-client.ts`)
- `zustand` ^5.0.11 - client state management (stores in `lib/stores/**`)

**Infrastructure:**
- `tsx` ^4.21.0 - run TS worker/CLI processes (used by `bin/clutch.ts` shebang and `run.sh` to run `worker/loop.ts` / `worker/chat-bridge.ts`)
- `tailwindcss` ^4 + `tailwind-merge` ^3.4.0 - styling utilities (`app/globals.css`, `components.json`)
- shadcn/ui (generated components) - UI primitives in `components/ui/**` and config in `components.json`
- `radix-ui` ^1.4.3 - UI primitives used by shadcn components (dependency in `package.json`)

## Configuration

**Environment:**
- Runtime config is driven by environment variables accessed via `process.env` (examples: `lib/convex/server.ts`, `lib/openclaw/rpc.ts`, `worker/config.ts`).
- `.env.local` is loaded by `run.sh` (`load_env()`), and Next.js also consumes env vars for runtime.

**Build:**
- Next.js config: `next.config.ts`
- TypeScript config: `tsconfig.json`, `worker/tsconfig.json`
- ESLint config: `eslint.config.mjs`
- Vitest config: `vitest.config.ts` (includes `test/setup.ts`)
- PostCSS config: `postcss.config.mjs`
- Tailwind entrypoint: `app/globals.css` (uses `@import "tailwindcss";`)
- shadcn/ui config: `components.json`

## Platform Requirements

**Development:**
- Node.js + pnpm (via Volta) - see `package.json` (`volta` section)
- Convex backend reachable at a configured URL (see `lib/convex/server.ts` and `lib/convex/client.ts`)
- OpenClaw gateway reachable for chat/session features (see `lib/openclaw/client.ts`, `app/api/openclaw/rpc/route.ts`)

**Production:**
- Next.js production server started via `next start` (or `./run.sh start`)
- OpenClaw gateway and Convex backend available to the server/worker processes (`worker/loop.ts`, `worker/chat-bridge.ts`)
- If using voice features: system tools/services invoked by `app/api/voice/route.ts` (ffmpeg, Whisper CLI, local TTS runner)

---

*Stack analysis: 2026-02-07*
