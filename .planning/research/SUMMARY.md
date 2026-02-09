# Project Research Summary

**Project:** OpenClutch - Real-time AI Agent Dashboard
**Domain:** Real-time dashboard/control center with WebSocket-driven architecture
**Researched:** 2026-02-02
**Confidence:** HIGH

## Executive Summary

OpenClutch is a single-user operational dashboard for OpenClaw AI agents, fundamentally different from typical Next.js CRUD apps. Unlike multi-tenant observability platforms (LangSmith, AgentOps), OpenClutch combines real-time monitoring with direct control in a project-centric workflow. The architecture centers on a persistent WebSocket connection to OpenClaw's gateway (80+ RPC methods, real-time event streams), not traditional REST APIs or database queries.

The recommended approach: Build a **WebSocket-first client application** using Next.js 15 App Router with a clear client/server boundary. Use native browser WebSocket API (not Socket.IO) for the OpenClaw connection, TanStack Query for server state caching, Zustand for local UI state, and Vercel AI Elements for chat with rich widgets. The foundation (WebSocket singleton, reconnection logic, event dispatcher) must be solid before building features, as everything depends on real-time data flows.

Key risks center on WebSocket lifecycle management: memory leaks from improper cleanup (Pitfall #1), over-caching stale data (Next.js 15's aggressive caching), and massive re-renders from global state. Secondary risks include SSR/hydration mismatches with real-time data and scope creep in project organization features. These are all preventable through established patterns identified in research, primarily by getting the foundation right in Phase 1-2 before building user-facing features.

## Key Findings

### Recommended Stack

The stack is optimized for **WebSocket-driven real-time updates** with structured AI chat, not traditional server-side rendered pages. Critical insight: Next.js limitations on hosting WebSocket servers don't matter because OpenClaw runs its own gateway - OpenClutch only needs to connect as a client.

**Core technologies:**
- **Next.js 15 (App Router):** Web framework - Server Components for static shell, Client Components for real-time views. Use `dynamic = 'force-dynamic'` to prevent over-caching.
- **Native WebSocket API:** Browser built-in connection to OpenClaw gateway. No library needed - OpenClaw uses standard WebSocket, not Socket.IO protocol.
- **TanStack Query v5:** Server state management - handles caching, background refetch, optimistic updates. Industry standard (80% adoption). Pairs with WebSocket via event-driven cache invalidation.
- **Zustand v5:** Client state management - lightweight (40% adoption), simple API. For UI state only (filters, selected items, preferences), not server data.
- **Vercel AI Elements:** Chat UI components - built on shadcn/ui, handles structured data (tool calls, reasoning, code artifacts). Released 2025, designed for AI chat with rich widgets.
- **Recharts 3.6.0:** Charts - React-idiomatic, good for token/cost analytics. Start here, add Tremor dashboard components if needed. Avoid Visx unless you need D3-level customization.
- **Vitest + Playwright:** Testing - Vitest for unit/component tests, Playwright for E2E and async Server Components. Next.js 15 official recommendation.
- **Turso (libSQL) OR IndexedDB:** Persistence - Turso if deploying edge, better-sqlite3 if self-hosted, IndexedDB if client-side only. Decision depends on deployment target (unresolved).

**Critical version requirements:**
- Recharts: Data point limiting needed for >100 points (performance ceiling)
- Drizzle ORM 0.44.x: Type-safe SQLite queries if using database
- Playwright 1.57+: Required for async Server Components testing

### Expected Features

Research reveals a sharp divide between **table stakes** (expected by 2026) and **differentiators** (competitive advantage). Features considered cutting-edge in 2024-2025 (session tracing, cost tracking, real-time monitoring) are now baseline expectations.

**Must have (table stakes):**
- **Session management:** List, filter, kill/cancel, detail view, status indicators, metadata display - industry standard in all platforms
- **Cost tracking:** Real-time token/cost analytics, per-model breakdown, date range filtering, CSV export - expected baseline
- **Cron monitoring:** Job list, enable/disable, manual trigger, last run status, execution history - standard in all cron tools
- **Real-time dashboard:** Live status overview, auto-refresh, activity feed, visual indicators, metrics cards - core requirement
- **Chat interface:** Streaming responses, markdown rendering, syntax highlighting, message history, code copy buttons - 2026 baseline

**Should have (competitive differentiators):**
- **Project-based organization:** Group sessions/tasks/crons by logical work units, not chronology - UNIQUE. Most dashboards organize by time/user/model. Highest unique value for MVP.
- **Bidirectional task management:** User assigns tasks to AI, AI assigns tasks to user - HIGHLY UNIQUE. Enables human-AI collaboration workflows. Requires OpenClaw integration.
- **Rich chat widgets:** Interactive forms, data visualizations, action buttons inline in chat - cutting edge (A2UI Protocol). Goes beyond markdown-only interfaces.
- **Advanced session recovery:** Automatic checkpointing, session rewind, replay for debugging - NEW in 2026 (Google ADK feature)
- **AI-powered insights:** LLM analyzing usage patterns, cost optimization suggestions, failure modes - VERY ADVANCED (LangSmith Insights Agent, late 2025)

**Defer (v2+):**
- **Multi-tenancy/auth:** Explicitly single-user, local-first. Adding this would compete with established platforms (LangSmith, AgentOps) - wrong strategy.
- **Token-level granularity:** Per-message token breakdown, prompt optimization scoring - high complexity, lower ROI
- **Advanced failure diagnostics:** Requires ML or LLM analysis infrastructure
- **Distributed tracing/custom alerting:** Enterprise complexity, overkill for single-user app

**MVP recommendation from research:** Table stakes + project-based organization. Defer bidirectional tasks (requires OpenClaw integration), rich widgets (A2UI protocol complexity), and AI insights (very high complexity).

### Architecture Approach

OpenClutch is a **client-island architecture** where Server Components provide static shell/layout, and a single Client Component island manages the WebSocket connection with event distribution to child components. Unlike REST-based dashboards that refetch on navigation, OpenClutch maintains persistent connection state and updates views reactively via events.

**Major components:**
1. **WebSocketProvider (singleton)** — Manages single WebSocket connection lifecycle, reconnection with exponential backoff (1s to 30s), heartbeat monitoring. Created once in root layout, shared via Context. ALL data flows through this component.

2. **RPCClient** — Type-safe wrapper for 80+ OpenClaw gateway methods (sessions.*, agent.*, cron.*, chat.*, usage.*). Handles request/response correlation with Promise-based API. Generates TypeScript types from OpenClaw's TypeBox schemas.

3. **EventDispatcher** — Routes EventFrames (agent|chat|cron|health|presence) from gateway to subscribers. Components use `useAgentEvents()`, `useChatEvents()` hooks to listen for specific event types. Triggers TanStack Query cache invalidation for affected data.

4. **State Management Layer** — TanStack Query for server state (sessions, cron jobs, usage data), Zustand for client state (UI filters, selected items, preferences). Clear separation prevents storing server state in Zustand (anti-pattern).

5. **Feature Modules** — Sessions Manager, Cron Manager, Chat Interface, Analytics Dashboard, Task Board. Each is self-contained with components/, hooks/, types.ts. Uses feature-based folder structure, not technical grouping.

6. **Widget Registry** — Maps chat message content patterns to renderer components (code blocks, tables, charts, custom components). Extensible system for rich chat without modifying core chat logic.

**Critical architectural decisions:**
- **Singleton WebSocket via Context:** Prevents multiple connections, state desynchronization, resource waste
- **Event-driven cache invalidation:** WebSocket events trigger TanStack Query refetch, avoiding polling
- **Client/Server boundary at layout:** Server Components for static structure, `'use client'` for WebSocket consumers
- **Feature-based folders:** Co-location over technical separation (components/ vs hooks/ vs types/)

**Dependency hierarchy from research:**
```
Foundation (Phase 1-2)
├─ WebSocket connection + RPC client + Event dispatcher
│
Real-time Views (Phase 3-5)
├─ Sessions (depends on agent events)
├─ Cron (depends on cron events)
├─ Chat (depends on chat events, streaming)
├─ Analytics (depends on usage.* RPC methods)
│
Advanced Features (Phase 6+)
├─ Project organization (depends on all views)
├─ Bidirectional tasks (depends on OpenClaw integration)
└─ Rich widgets (depends on chat, custom rendering)
```

### Critical Pitfalls

Research identified 14 pitfalls across critical/moderate/minor severity. Top 5 that can kill the project:

1. **WebSocket memory leaks (CRITICAL)** — Improper useEffect cleanup creates zombie connections. Memory climbs from 200MB to 2GB+ after extended use. Prevention: Always return cleanup function that calls `socket.close()`. Detection: Monitor browser memory in DevTools Performance tab during extended sessions. Address in Phase 1 (Foundation).

2. **Next.js 15 over-caching real-time data (CRITICAL)** — Aggressive caching shows stale session/cost/cron data even when WebSocket events fire. Router Cache has minimum 30s stale time. Prevention: Set `export const dynamic = 'force-dynamic'` and `export const revalidate = 0` in route segment config. Use experimental Dynamic IO in Next.js 15 to flip caching model. Address in Phase 1 immediately.

3. **Massive re-renders from global WebSocket state (CRITICAL)** — Dashboard with 1000+ tasks re-renders 50+ times per interaction when all WebSocket state lives in single global context. Prevention: Separate contexts by domain (SessionContext, TaskContext), use React.memo for list items, useMemo for computed values, useCallback for handlers. Address in Phase 2 (Real-time Foundation).

4. **SSR/hydration mismatch with real-time data (CRITICAL)** — Server renders initial snapshot, client hydrates with newer WebSocket data, causing "Text content does not match" errors or visual flicker. Prevention: Use client-only components (`ssr: false` in dynamic import), shallow copy server data before useState, separate static shell from dynamic content. Address in Phase 1 (Foundation).

5. **Missing WebSocket reconnection logic (CRITICAL)** — Network disconnects or laptop sleep closes WebSocket. Dashboard shows stale data indefinitely. Prevention: Exponential backoff reconnection (1s to 30s max), state reconciliation on reconnect, visual connection status indicator. Address in Phase 2 (Real-time Foundation).

**Secondary pitfalls to track:**
- **Chat auto-scroll fighting user scrolling (MODERATE)** — Detect if user scrolled up, only auto-scroll when at bottom. Address in Phase 4 (Chat Interface).
- **Race conditions in session kill commands (MODERATE)** — Disable button after click, use request ID tracking with idempotency. Address in Phase 3 (Session Management).
- **Recharts performance ceiling (MODERATE)** — Limit data points to <100, throttle real-time updates to 1/second. May need research in Phase 5 (Analytics).
- **Project feature creep (MODERATE)** — Define MVP scope document BEFORE Phase 6. Defer templates, multi-workspace, team features explicitly.

## Implications for Roadmap

Research strongly indicates a **foundation-first approach**. Unlike CRUD apps where you can build features incrementally, WebSocket-driven dashboards require solid infrastructure (connection management, state patterns, event routing) before features work reliably. The pitfalls analysis confirms this: 6 of 14 pitfalls must be addressed in Phases 1-2 or they cascade through all subsequent phases.

### Suggested Phase Structure

**Phase 1: Foundation & WebSocket Infrastructure** (2 weeks)
**Rationale:** Everything depends on WebSocket connection. Build and test in isolation before adding features. Establishes patterns that prevent 4 critical pitfalls.
**Delivers:**
- GatewayClient class (connection, reconnection with exponential backoff, heartbeat)
- WebSocketProvider context with singleton pattern
- Type definitions from OpenClaw schemas
- Route segment config (`dynamic = 'force-dynamic'`) to prevent over-caching
- Client/server boundary patterns established
- Connection status indicator

**Addresses pitfalls:** #1 (memory leaks via proper cleanup), #2 (over-caching via route config), #4 (hydration via boundary patterns)
**Research needed:** Minimal - standard WebSocket patterns are well-documented

---

**Phase 2: RPC Client & State Management** (2 weeks)
**Rationale:** Establishes communication and state patterns before building views. Proves architecture works.
**Delivers:**
- RPCClient class (request/response correlation, timeouts, error handling)
- Type-safe method wrappers for core methods (sessions.*, agent.*, cron.*)
- EventDispatcher with subscribe/unsubscribe by event type
- TanStack Query setup with queryClient
- Zustand store for UI state (designed to prevent re-render storms)
- First query hook: `useSessions()` with event-driven invalidation
- Cross-tab sync via BroadcastChannel (prevents state inconsistency)

**Addresses pitfalls:** #3 (re-renders via state architecture), #5 (reconnection logic), #6 (state sync across tabs)
**Research needed:** Minimal - TanStack Query + WebSocket is proven pattern (blog.logrocket.com source)

---

**Phase 3: Session Management (Table Stakes)** (1 week)
**Rationale:** First real feature, validates foundation works. Sessions are core dashboard value.
**Delivers:**
- Session list component (active sessions, status, metadata)
- Session card (model, tokens, duration)
- Kill button with optimistic update and race condition prevention
- Session detail view
- Session filtering (date, status, model)
- Real-time status updates via agent events

**Features from FEATURES.md:** Session list/filter/kill/detail/status (all table stakes)
**Addresses pitfalls:** #11 (race conditions in kill via request ID tracking)
**Research needed:** None - standard patterns

---

**Phase 4: Cron Monitoring (Table Stakes)** (1 week)
**Rationale:** Independent from sessions, validates pattern reuse across features.
**Delivers:**
- Cron job list (jobs, status, next run time)
- Enable/disable toggle
- Manual trigger button
- Execution history panel
- Real-time status updates via cron events

**Features from FEATURES.md:** Cron list/trigger/history/status (all table stakes)
**Addresses pitfalls:** None new - reuses Phase 2 patterns
**Research needed:** None - standard patterns

---

**Phase 5: Chat Interface (Table Stakes)** (2 weeks)
**Rationale:** More complex than list views, needs streaming and event handling. Foundation is proven.
**Delivers:**
- Message list (scrollable, auto-scroll with scroll position detection)
- Chat input (send button, calls `chat.inject`)
- Streaming response handling via chat events
- Markdown rendering with syntax highlighting (Streamdown or react-markdown)
- Code copy buttons
- Loading indicators

**Features from FEATURES.md:** Streaming, markdown, syntax highlighting, message history (all table stakes)
**Addresses pitfalls:** #7 (auto-scroll fighting user via scroll detection)
**Research needed:** None - streaming chat is well-documented

---

**Phase 6: Analytics Dashboard (Table Stakes)** (1 week)
**Rationale:** Data-heavy, benefits from proven TanStack Query patterns. Straightforward after foundation.
**Delivers:**
- Usage query hooks (`usage.tokens`, `usage.costs`)
- Time range selector (daily/weekly/monthly)
- Token trends line chart (Recharts)
- Model distribution chart
- Per-session cost breakdown
- CSV export

**Features from FEATURES.md:** Cost tracking, token visualization, date filtering, export (all table stakes)
**Addresses pitfalls:** #9 (Recharts performance via data point limiting)
**Research needed:** MEDIUM - May need to prototype chart performance with real data volume, consider alternatives if Recharts hits ceiling

---

**Phase 7: Project Organization (Differentiator - MVP)** (2 weeks)
**Rationale:** Ties features together, provides unique value. Requires understanding all data models, so comes after core views.
**Delivers:**
- Project model (id, name, description)
- Project CRUD (create, list, delete)
- Project selector in sidebar
- Tag sessions/crons/chats with project ID
- Filter all views by active project
- Project-level analytics (cost per project, sessions per project)

**Features from FEATURES.md:** Project grouping, project-level analytics, project filtering (competitive differentiator)
**Addresses pitfalls:** #13 (feature creep via explicit MVP scope document)
**Research needed:** None - data modeling is straightforward

---

**Phase 8+: Post-MVP Features** (Defer pending user feedback)
**Candidates:**
- Rich chat widgets (A2UI Protocol implementation) - HIGH complexity
- Bidirectional task management - Requires OpenClaw plugin/memory integration
- Advanced session recovery - Requires OpenClaw checkpointing
- AI-powered insights - VERY HIGH complexity, requires LLM analysis

**Rationale:** MVP delivers all table stakes + one differentiator (project organization). Get user feedback before investing in complex features that may not be needed.

### Phase Ordering Rationale

**Why foundation-first (Phases 1-2):**
- WebSocket lifecycle issues (memory leaks, reconnection, state sync) affect ALL features
- Next.js caching pitfalls only addressable via route config set early
- State management architecture determines performance throughout app
- 6 of 14 pitfalls must be addressed in foundation or they cascade

**Why simple views before complex (Phases 3-6):**
- Sessions/Cron are list-based, validate foundation without complexity
- Chat requires streaming and widgets - easier after foundation is proven
- Analytics benefits from TanStack Query patterns established in earlier phases

**Why project organization last in MVP (Phase 7):**
- Requires understanding all data models (sessions, crons, chats, tasks)
- Ties features together, so needs features to exist first
- Feature creep risk - delay until scope is clear

**Why defer post-MVP features:**
- Bidirectional tasks require upstream OpenClaw changes (unknown timeline)
- Rich widgets (A2UI) and AI insights are very high complexity
- Better to validate MVP value proposition before building advanced features

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 6 (Analytics Dashboard):** Recharts performance with real OpenClaw data volume uncertain. May need to prototype early or research canvas-based alternatives (Chart.js, ECharts) if SVG performance ceiling is hit.
- **Phase 8+ (Bidirectional Tasks):** Requires research into OpenClaw's plugin system or memory API. How to store tasks in OpenClaw domain? Can agents create task records via RPC? Unknown dependencies on OpenClaw architecture.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Foundation):** WebSocket singleton, reconnection, cleanup patterns well-documented
- **Phase 2 (State Management):** TanStack Query + WebSocket is proven pattern, multiple sources
- **Phase 3-5 (Core Views):** List/detail/filter/streaming patterns are standard
- **Phase 7 (Project Organization):** Data modeling and filtering are straightforward

**Open questions for validation during implementation:**
1. **Deployment target:** Vercel (edge) vs self-hosted? Affects database choice (Turso vs better-sqlite3 vs IndexedDB).
2. **OpenClaw gateway capabilities:** Does it expose all needed RPC methods? Can it support task callbacks for bidirectional features?
3. **Real data volume:** How many sessions/tasks/events in realistic usage? Affects performance decisions (Recharts vs alternatives, caching strategy).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Next.js 15, TanStack Query, Zustand, Recharts verified with official docs and recent 2025-2026 sources. Native WebSocket confirmed for OpenClaw use case. |
| Features | HIGH | Clear divide between table stakes and differentiators based on 15+ observability platform comparisons. Project-based organization uniqueness validated. |
| Architecture | HIGH | WebSocket-first pattern verified across multiple sources (blog.logrocket.com, ably.com, github discussions). Component boundaries clear from OpenClaw gateway protocol. |
| Pitfalls | HIGH | Memory leaks, over-caching, re-renders documented with Jan 2026 sources. SSR/hydration patterns from official Next.js docs. Reconnection logic from 2026 WebSocket best practices. |

**Overall confidence:** HIGH

Research draws from:
- Official documentation (Next.js, TanStack Query, Recharts, OpenClaw source)
- Recent 2025-2026 articles (Jan 2026 memory leak analysis, Next.js 15 caching deep dive)
- Industry comparisons (15+ AI observability platforms, 10+ cron monitoring tools)
- Established patterns (WebSocket best practices, React performance optimization)

### Gaps to Address

**Deployment target unknown (affects database choice):**
- **Gap:** Don't know if deploying to Vercel (edge), self-hosted server, or pure client-side
- **Impact:** Turso (edge-compatible SQLite) vs better-sqlite3 (Node.js only) vs IndexedDB (client-only)
- **Resolution:** Decide during Phase 1. If uncertain, start with IndexedDB (simplest, no backend needed)

**OpenClaw integration capabilities unknown:**
- **Gap:** Don't know if OpenClaw can support task creation callbacks (needed for bidirectional tasks)
- **Impact:** Bidirectional tasks may need to be deferred or implemented differently
- **Resolution:** Research OpenClaw plugin API during Phase 8+ planning if pursuing this feature

**Real data volume unknown:**
- **Gap:** Don't know how many sessions/tasks/events in realistic usage, how many data points in cost analytics
- **Impact:** Affects Recharts vs alternatives decision, caching strategy, performance optimization priority
- **Resolution:** Prototype with realistic data in Phase 5 (Analytics). Flag for deeper research if performance issues arise.

**shadcn/ui Radix performance (watching):**
- **Gap:** Community reports of Radix performance issues with large datasets, but limited hard data
- **Impact:** May need to migrate components or use lightweight alternatives for high-frequency interactions
- **Resolution:** Monitor performance throughout UI-heavy phases. Have migration path ready (Base UI).

## Sources

### Primary (HIGH confidence)

**Official Documentation:**
- Next.js 15 App Router: https://nextjs.org/docs/app
- TanStack Query v5: https://tanstack.com/query/latest
- Zustand Documentation: https://zustand.docs.pmnd.rs/
- Recharts: https://recharts.github.io/
- OpenClaw Gateway Source Code: `/home/dan/src/openclaw/src/gateway/`

**Recent Authoritative Sources (2025-2026):**
- Memory Leaks in React & Next.js (Jan 2026): https://medium.com/@essaadani.yo/memory-leaks-in-react-next-js-what-nobody-tells-you-91c72b53d84d
- Fix over-caching with Dynamic IO in Next.js 15: https://blog.logrocket.com/dynamic-io-caching-next-js-15/
- How to Handle WebSocket Reconnection Logic (Jan 2026): https://oneuptime.com/blog/post/2026-01-24-websocket-reconnection-logic/view
- State Management in 2026: https://www.nucamp.co/blog/state-management-in-2026-redux-context-api-and-modern-patterns

### Secondary (MEDIUM confidence)

**Architecture Patterns:**
- TanStack Query and WebSockets: https://blog.logrocket.com/tanstack-query-websockets-real-time-react-data-fetching/
- React WebSocket Best Practices 2026: https://ably.com/blog/websockets-react-tutorial
- Next.js Architecture 2026: https://www.yogijs.tech/blog/nextjs-project-architecture-app-router
- Socket.IO Singleton Pattern: https://github.com/mahmodghnaj/wrapping-socket-with-nextJs

**Feature Research:**
- 15 AI Agent Observability Tools 2026: https://research.aimultiple.com/agentic-monitoring/
- Top 5 AI Agent Platforms 2026: https://o-mega.ai/articles/top-5-ai-agent-observability-platforms-the-ultimate-2026-guide
- LangSmith Insights Agent: https://www.blog.langchain.com/insights-agent-multiturn-evals-langsmith/
- A2UI Protocol Guide 2026: https://a2aprotocol.ai/blog/a2ui-guide
- 10 Best Cron Monitoring Tools: https://betterstack.com/community/comparisons/cronjob-monitoring-tools/

**Pitfalls & Performance:**
- React Rendering Bottleneck (60% reduction case study): https://medium.com/@sosohappy/react-rendering-bottleneck-how-i-cut-re-renders-by-60-in-a-complex-dashboard-ed14d5891c72
- Building a Shadcn Dashboard (Jan 2026): https://medium.com/codetodeploy/building-a-shadcn-dashboard-what-works-what-breaks-and-what-to-watch-out-for-26053fb32bbd
- Recharts Performance Guide: https://recharts.github.io/guide/performance/
- Best React Chart Libraries 2025: https://blog.logrocket.com/best-react-chart-libraries-2025/

### Tertiary (LOW confidence - general knowledge)

**Project Management:**
- Scope Creep Prevention: https://www.projectmanager.com/blog/5-ways-to-avoid-scope-creep
- Sequencing Table Stakes vs Differentiators: https://www.productteacher.com/articles/sequencing-table-stakes-and-differentiators

---

**Research completed:** 2026-02-02
**Ready for roadmap:** Yes

**Key takeaway for roadmapper:** Build the foundation right (Phases 1-2) and features will be easier. WebSocket lifecycle management, Next.js caching config, and state architecture determine success or failure. MVP = all table stakes + project organization (unique differentiator). Defer complex features (bidirectional tasks, rich widgets, AI insights) until MVP validates value proposition.
