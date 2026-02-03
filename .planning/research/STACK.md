# Technology Stack

**Project:** The Trap - Real-time AI Agent Dashboard
**Researched:** 2026-02-02
**Overall Confidence:** HIGH

## Recommended Stack

### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 15.x (App Router) | Web framework | Already decided. App Router supports both client-side and server-side patterns. WebSocket connections work client-side. |
| TypeScript | 5.x | Type safety | Already decided. Essential for large codebases and real-time data modeling. |
| Tailwind CSS | 3.x | Styling | Already decided. Works seamlessly with shadcn/ui. |
| shadcn/ui | Latest | Component system | Already decided. Copy-paste philosophy gives full control over components. |

**Confidence:** HIGH (official Next.js docs, current versions verified)

### WebSocket Client
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Native WebSocket API | Browser built-in | External WS server connection | For connecting to OpenClaw gateway from client-side. No library needed - browser's native WebSocket API is sufficient and lightweight. Next.js limitations only apply to hosting WS servers, not connecting to external ones. |
| ws | 8.19.0 | (Optional) Node.js WS | Only if you need server-side WS operations. For pure client-side connections to OpenClaw, native API is better. |

**Why not Socket.IO client?** OpenClaw uses standard WebSocket with 80+ RPC methods. Socket.IO adds unnecessary overhead (fallback transports, custom protocol). Native WebSocket is simpler and faster for this use case.

**Confidence:** HIGH (verified with 2025-2026 sources, common pattern for external WS connections)

### Chat UI with Rich Widgets
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vercel AI Elements | Latest (shadcn registry) | Chat components with rich widgets | **RECOMMENDED.** Built on shadcn/ui, integrates with Vercel AI SDK, provides 25+ components including message threads, reasoning panels, code artifacts. Handles structured data rendering (tool calls, JSON as components). Uses copy-paste model for full customization. Recently released (2025), actively maintained by Vercel. |
| assistant-ui | Latest (shadcn CLI) | Alternative chat library | **ALTERNATIVE.** More composable primitives, broader backend support (not just Vercel AI SDK). Good if you need extreme customization or non-Vercel backend. Migrated to shadcn CLI in 2025. |

**Why AI Elements over generic chat libraries?**
- Generic libraries (CometChat, Syncfusion) are designed for human-to-human chat, not AI with structured data
- AI Elements understands `message.parts` and can render tool calls, reasoning, citations inline
- Already integrated with shadcn/ui aesthetic
- Handles AI-specific patterns: streaming, thinking blocks, code artifacts, human approvals

**Implementation note:** AI Elements components pass `message.parts` to automatically render text, tool calls, and reasoning. For custom widgets (charts, tables), extend the message renderer to handle custom part types.

**Confidence:** HIGH (official Vercel docs, 2025 release, designed for this exact use case)

### State Management for Real-time Data
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Zustand | 5.x | Global state | **RECOMMENDED for 90% of use cases.** Simple, fast, flexible. No boilerplate. Works well with Next.js App Router when following per-request store pattern. Perfect for WebSocket-driven real-time state (sessions, tasks, analytics). Avoids Context re-render issues. |
| Jotai | Latest | Alternative state | **USE IF** you have complex atomic state relationships needing fine-grained reactivity. Overkill for most dashboards. |

**Why Zustand over Redux?** Redux with RTK is still excellent but heavier. For a dashboard with WebSocket-driven state, Zustand's simplicity wins. If you later need time-travel debugging or complex middleware, migrate then.

**Why not React Context?** Context causes re-render cascade issues with frequent WebSocket updates. Zustand's selector-based subscriptions prevent unnecessary renders.

**Next.js App Router pattern:** Create stores per-request (not global) to avoid cross-request state leakage. Use client components for store consumers.

**Confidence:** HIGH (2025 state management consensus, proven pattern for real-time dashboards)

### Charting & Data Visualization
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Recharts | 3.6.0 | Charts | **RECOMMENDED.** 24.8K stars, clean SVG rendering, idiomatic React API, straightforward for common chart types. Works great for token/cost analytics (line charts, bar charts, area charts). Lightweight, well-documented. |
| Tremor | 3.18.7 | Dashboard components | **OPTIONAL.** High-level dashboard components (built on Recharts). Good for rapid prototyping. Acquired by Vercel in 2025, now open source (MIT). Use if you want pre-built KPI cards and dashboard layouts. Skip if you want more control. |
| Visx | Latest | Advanced visualization | **SKIP for MVP.** Low-level D3 primitives, steep learning curve. Only use if you need highly custom, interactive visualizations that Recharts can't handle. |

**Recommendation:** Start with Recharts. If you find yourself building the same dashboard patterns repeatedly, add Tremor components. Avoid Visx unless you have specific D3-level needs.

**Confidence:** HIGH (2025 chart library comparison, npm stats verified, Tremor acquisition confirmed)

### Database (Local Storage)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Turso (libSQL) | Latest | SQLite-compatible DB | **RECOMMENDED if you need distributed/edge SQLite.** libSQL is a SQLite fork with server mode, replication, S3 backups. better-sqlite3-compatible API. Good for task persistence across edge functions. Free tier available. |
| better-sqlite3 | Latest | Synchronous SQLite | **USE IF** you're deploying to a traditional Node.js server with filesystem access. Faster for local operations. Won't work on Vercel/Cloudflare edge. |
| Drizzle ORM | 0.44.x | Type-safe SQL | **RECOMMENDED** with either Turso or better-sqlite3. Type-safe queries, excellent TypeScript support, works with both SQLite drivers. Use `drizzle-orm/libsql` for Turso or `drizzle-orm/better-sqlite3` for local. |

**Do you even need a database?** If task storage is just client-side caching of OpenClaw data, consider:
- IndexedDB (via Dexie.js) for browser-only storage
- Zustand persist middleware for simple state persistence

**Only use SQLite if:** You need server-side task queuing, multi-user task history, or offline-first sync.

**Confidence:** MEDIUM (Turso vs better-sqlite3 depends on deployment target - need to decide Vercel vs self-hosted)

### Testing Stack
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vitest | Latest | Unit/component tests | **RECOMMENDED.** Faster than Jest, better DX, native ESM support. Official Next.js docs support it. Use with React Testing Library for component tests. |
| React Testing Library | 16.3.1 | Component rendering | De facto standard for React component testing. Works with Vitest. |
| Playwright | 1.57+ | E2E tests | **REQUIRED for async Server Components.** Also for full user flows (WebSocket connection → dashboard updates). Supports Chromium/Firefox/WebKit. Next.js 15 has experimental fetch mocking with Playwright. |

**Why Vitest over Jest?** Vitest is lightweight, blazing fast, and designed for modern tooling (Vite/ESM). Jest still works but Vitest is the 2025 choice.

**What to test where:**
- **Vitest + React Testing Library:** Client components, synchronous Server Components, utility functions
- **Playwright:** Async Server Components, WebSocket real-time updates, full user journeys, cross-browser testing

**Confidence:** HIGH (Next.js official docs recommend this stack, industry standard for 2025-2026)

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Chat UI | Vercel AI Elements | CometChat, Syncfusion, Stream Chat | Those are for human-to-human chat. AI Elements is built for AI with structured data (tool calls, reasoning, citations). |
| Chat UI | Vercel AI Elements | assistant-ui | assistant-ui is more composable but requires more setup. AI Elements is higher-level, faster to ship. Use assistant-ui if you need non-Vercel backends. |
| Charts | Recharts | Chart.js | Chart.js uses canvas (harder to style), imperative API. Recharts is React-idiomatic with JSX. |
| Charts | Recharts | Visx | Visx requires D3 knowledge, more code. Recharts handles 90% of cases with 10% of the code. |
| State | Zustand | Redux Toolkit | RTK is great but heavier. Zustand's simplicity wins for this scope. |
| State | Zustand | Jotai | Jotai is excellent for complex atomic state but overkill unless you have fine-grained reactivity needs. |
| Testing | Vitest | Jest | Jest works but Vitest is faster, better ESM support, lighter config. |
| DB | Turso | PlanetScale, Neon | Those are hosted Postgres. Turso is SQLite-compatible, better for local-first + edge. Overkill if you don't need SQL. |
| DB | IndexedDB + Dexie | SQLite | Simpler if you only need client-side storage. No server component needed. |

## Installation

### Core Dependencies

```bash
# Already installed (from project creation)
npm install next@latest react react-dom
npm install -D typescript @types/node @types/react @types/react-dom
npm install -D tailwindcss postcss autoprefixer
npm install -D eslint eslint-config-next

# State management
npm install zustand

# Charts
npm install recharts

# Chat UI (via shadcn CLI)
npx shadcn@latest add https://elements.ai-sdk.dev/api/registry/all.json

# Vercel AI SDK (required for AI Elements)
npm install ai @ai-sdk/openai @ai-sdk/anthropic

# Optional: Tremor dashboard components
npm install @tremor/react
```

### Database (if needed)

```bash
# Option 1: Turso + Drizzle
npm install @libsql/client drizzle-orm
npm install -D drizzle-kit

# Option 2: better-sqlite3 + Drizzle (Node.js only)
npm install better-sqlite3 drizzle-orm
npm install -D @types/better-sqlite3 drizzle-kit

# Option 3: Client-side only (IndexedDB)
npm install dexie
```

### Testing

```bash
npm install -D vitest @vitejs/plugin-react jsdom
npm install -D @testing-library/react @testing-library/dom @testing-library/jest-dom
npm install -D @playwright/test
npm install -D vite-tsconfig-paths  # For TypeScript path mapping
```

## Configuration Notes

### Next.js 15 + WebSocket

**IMPORTANT:** Next.js doesn't support hosting WebSocket servers on Vercel. However, **connecting to external WebSocket servers from the client works fine**. For The Trap:
- OpenClaw gateway runs separately (WebSocket server)
- Next.js dashboard connects via native browser WebSocket API (client-side)
- No Next.js server involvement needed

```typescript
// app/components/OpenClawClient.tsx
'use client';

import { useEffect, useState } from 'react';

export function OpenClawClient() {
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket('ws://openclaw-gateway:port');

    socket.onopen = () => console.log('Connected to OpenClaw');
    socket.onmessage = (event) => {
      const rpcMessage = JSON.parse(event.data);
      // Handle RPC message...
    };

    setWs(socket);
    return () => socket.close();
  }, []);

  return <div>Dashboard UI...</div>;
}
```

### Zustand + Next.js App Router

**CRITICAL:** Don't create global Zustand stores with App Router. Create per-request stores:

```typescript
// lib/stores/taskStore.ts
import { createStore } from 'zustand/vanilla';

export type TaskStore = {
  tasks: Task[];
  addTask: (task: Task) => void;
};

export const createTaskStore = () => {
  return createStore<TaskStore>((set) => ({
    tasks: [],
    addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
  }));
};
```

```typescript
// app/providers/TaskStoreProvider.tsx
'use client';

import { createContext, useRef, useContext } from 'react';
import { useStore } from 'zustand';
import { createTaskStore, TaskStore } from '@/lib/stores/taskStore';

const TaskStoreContext = createContext<ReturnType<typeof createTaskStore> | null>(null);

export function TaskStoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef(createTaskStore());
  return (
    <TaskStoreContext.Provider value={storeRef.current}>
      {children}
    </TaskStoreContext.Provider>
  );
}

export function useTaskStore<T>(selector: (state: TaskStore) => T): T {
  const store = useContext(TaskStoreContext);
  if (!store) throw new Error('Missing TaskStoreProvider');
  return useStore(store, selector);
}
```

See: [Zustand Next.js Setup](https://zustand.docs.pmnd.rs/guides/nextjs)

### Vitest + Next.js 15

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

```typescript
// vitest.setup.ts
import '@testing-library/jest-dom';
```

Add to `package.json`:
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test"
  }
}
```

See: [Next.js Testing: Vitest](https://nextjs.org/docs/app/guides/testing/vitest)

### Playwright + Next.js 15

```bash
npx playwright install
```

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

See: [Next.js Testing: Playwright](https://nextjs.org/docs/pages/guides/testing/playwright)

## Version Verification (as of 2026-02-02)

| Package | Latest Verified | Published | Source |
|---------|-----------------|-----------|--------|
| Next.js | 15.x | 2025 | [Next.js Docs](https://nextjs.org) |
| Recharts | 3.6.0 | 1 month ago | [npm](https://www.npmjs.com/package/recharts) |
| Zustand | 5.x | 2025 | [Zustand Docs](https://zustand.docs.pmnd.rs/) |
| Tremor | 3.18.7 | 1 year ago | [npm](https://www.npmjs.com/package/@tremor/react) |
| ws | 8.19.0 | 13 days ago | [npm](https://www.npmjs.com/package/ws) |
| Vitest | Latest | 2025 | [Vitest Docs](https://vitest.dev) |
| Playwright | 1.57+ | Nov 2025 | [Playwright Releases](https://playwright.dev/docs/release-notes) |
| React Testing Library | 16.3.1 | ~1 month ago | [npm](https://www.npmjs.com/package/@testing-library/react) |
| Drizzle ORM | 0.44.x | Aug 2025 | [Drizzle Docs](https://orm.drizzle.team) |

**Note:** Tremor published 1 year ago but acquired by Vercel in Feb 2025 and made open source. Active development continues under Vercel.

## Open Questions

1. **Deployment target?** Vercel (edge) vs self-hosted (traditional Node.js)?
   - If Vercel: Use Turso for SQLite
   - If self-hosted: Use better-sqlite3 for simplicity

2. **Do you actually need persistent storage?** If tasks are just UI state synced from OpenClaw:
   - Consider client-side only (IndexedDB or Zustand persist)
   - Skip SQLite entirely

3. **Custom widget types?** AI Elements handles common AI patterns (tool calls, reasoning, code). For custom widgets (charts inline in chat):
   - Extend AI Elements message renderer
   - Or build custom `MessagePart` renderers

## Anti-Patterns to Avoid

1. **Don't use Socket.IO client for standard WebSocket** - Adds unnecessary overhead. Native WebSocket API is simpler and faster.

2. **Don't create global Zustand stores in App Router** - Causes cross-request state leakage. Use per-request stores with Context.

3. **Don't use Jest for new projects** - Vitest is faster and simpler. Jest works but you'll spend time on config Vitest solves.

4. **Don't use Chart.js** - Canvas-based charts are harder to style with Tailwind. Recharts uses SVG and integrates better.

5. **Don't use generic chat libraries for AI** - CometChat, Syncfusion, etc. are for human chat. AI Elements understands AI patterns (streaming, tool calls, reasoning).

6. **Don't skip E2E tests for async Server Components** - Vitest doesn't support them. Playwright is required.

7. **Don't use better-sqlite3 on Vercel** - No filesystem access. Use Turso or client-side storage.

## Sources

### WebSocket & Real-time
- [Next.js + WebSocket Discussion](https://github.com/vercel/next.js/discussions/14950)
- [WebSockets with Next.js (Pedro Alonso)](https://www.pedroalonso.net/blog/websockets-nextjs-part-1/)
- [Building Real-Time Apps with Next.js and WebSockets](https://arnab-k.medium.com/building-real-time-web-applications-with-next-js-and-websockets-878b15f5726f)

### Chat UI Components
- [LlamaIndex Chat UI Documentation](https://next.ts.llamaindex.ai/docs/chat-ui)
- [Vercel AI Elements](https://vercel.com/changelog/introducing-ai-elements)
- [shadcn AI Components](https://www.shadcn.io/ai)
- [assistant-ui GitHub](https://github.com/assistant-ui/assistant-ui)

### Charting & Visualization
- [Top 5 Data Visualization Libraries 2025](https://dev.to/burcs/top-5-data-visualization-libraries-you-should-know-in-2025-21k9)
- [Best React Chart Libraries 2025 (LogRocket)](https://blog.logrocket.com/best-react-chart-libraries-2025/)
- [Recharts npm](https://www.npmjs.com/package/recharts)
- [Tremor Official Site](https://www.tremor.so/)
- [Vercel Acquires Tremor](https://vercel.com/blog/vercel-acquires-tremor)

### State Management
- [State Management in 2025: Zustand vs Redux vs Jotai](https://dev.to/hijazi313/state-management-in-2025-when-to-use-context-redux-zustand-or-jotai-2d2k)
- [Zustand Next.js Guide](https://zustand.docs.pmnd.rs/guides/nextjs)
- [State Management Trends in React 2025](https://makersden.io/blog/react-state-management-in-2025)

### Database & ORM
- [Turso libsql-js GitHub](https://github.com/tursodatabase/libsql-js)
- [Building better-sqlite3 Compatible Package (Turso)](https://turso.tech/blog/building-a-better-sqlite3-compatible-javascript-package-with-rust-a388cee9)
- [Drizzle ORM SQLite Guide](https://orm.drizzle.team/docs/get-started-sqlite)

### Testing
- [Next.js Testing: Vitest (Official Docs)](https://nextjs.org/docs/app/guides/testing/vitest)
- [Next.js Testing: Playwright (Official Docs)](https://nextjs.org/docs/pages/guides/testing/playwright)
- [Unit and E2E Tests with Vitest & Playwright (Strapi)](https://strapi.io/blog/nextjs-testing-guide-unit-and-e2e-tests-with-vitest-and-playwright)
- [Playwright 1.57 Update](https://medium.com/@szaranger/playwright-1-57-the-must-use-update-for-web-test-automation-in-2025-b194df6c9e03)

### shadcn/ui & Dashboard Patterns
- [shadcn/ui Dashboard Examples](https://ui.shadcn.com/examples/dashboard)
- [Shadcn UI Kit](https://shadcnuikit.com)
- [Shadcnblocks Dashboard](https://www.shadcnblocks.com/admin-dashboard)
