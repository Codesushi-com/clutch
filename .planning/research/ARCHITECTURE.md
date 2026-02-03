# Architecture Patterns

**Domain:** Real-time Dashboard with WebSocket RPC
**Researched:** 2026-02-02
**Confidence:** HIGH

## Recommended Architecture

The Trap is fundamentally a **WebSocket-first client application** that consumes OpenClaw's gateway API. Unlike typical Next.js CRUD apps that rely on server-side rendering and database queries, The Trap's primary data source is a persistent WebSocket connection delivering real-time events and handling 80+ RPC methods.

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js 15 App                       │
│                                                         │
│  ┌───────────────────────────────────────────────┐    │
│  │  Server Components (Layout, Shell)            │    │
│  └───────────────────────────────────────────────┘    │
│                       │                                 │
│                       ▼                                 │
│  ┌───────────────────────────────────────────────┐    │
│  │  Client Island: WebSocket Manager             │    │
│  │  - Singleton connection                       │    │
│  │  - JSON-RPC client (80+ methods)              │    │
│  │  - Reconnection with exponential backoff      │    │
│  │  - Event distribution                         │    │
│  └───────────────────────────────────────────────┘    │
│           │              │              │              │
│           ▼              ▼              ▼              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ Real-time    │ │ Server State │ │ Local State  │  │
│  │ Events       │ │ (TanStack    │ │ (Zustand)    │  │
│  │ (useEffect)  │ │  Query)      │ │              │  │
│  └──────────────┘ └──────────────┘ └──────────────┘  │
│           │              │              │              │
│           ▼              ▼              ▼              │
│  ┌───────────────────────────────────────────────┐    │
│  │  Dashboard Views (Client Components)          │    │
│  │  - Sessions  - Cron  - Chat                   │    │
│  │  - Analytics - Tasks                          │    │
│  └───────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼ WebSocket (port 18789)
              ┌─────────────────┐
              │ OpenClaw Gateway│
              └─────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **WebSocketProvider** | Singleton WebSocket connection lifecycle, reconnection strategy, heartbeat monitoring | OpenClaw Gateway (WS), all client components via Context |
| **RPCClient** | Type-safe wrapper for 80+ gateway methods, request/response correlation, error handling | WebSocketProvider, React Query |
| **EventDispatcher** | Receives EventFrames from gateway, routes to subscribers by event type | WebSocketProvider, feature hooks |
| **TanStack Query Store** | Caches server state (sessions list, cron jobs, config), handles background refetch, optimistic updates | RPCClient, dashboard views |
| **Zustand Store** | UI state (active view, filters, sidebar state), local project/task organization, user preferences | Dashboard views, layout components |
| **Session Manager** | Renders session list, handles kill/cancel operations, displays live status | TanStack Query, EventDispatcher (agent events) |
| **Cron Manager** | Displays cron jobs, triggers manual runs, shows history | TanStack Query, EventDispatcher (cron events) |
| **Chat Interface** | Message rendering with pluggable widgets, sends chat.inject, handles chat.abort | RPCClient, EventDispatcher (chat events), Widget Registry |
| **Widget Registry** | Maps message types to renderers (code blocks, tables, charts, custom components) | Chat Interface, individual widget components |
| **Analytics Dashboard** | Token/cost breakdown, usage trends, model distribution | TanStack Query (usage.* methods), EventDispatcher |
| **Task Board** | Kanban/list view for tasks, project grouping, drag-and-drop | Zustand (local), future: OpenClaw plugin or memory |

### Data Flow

**1. Initial Connection**
```
Next.js Server → HTML Shell (Server Component)
  → WebSocketProvider (Client Component, "use client")
    → Browser WebSocket API connects to ws://localhost:18789
      → Sends ConnectParams (protocol negotiation, device auth)
        → Receives HelloOk (methods list, initial snapshot)
          → Populates TanStack Query cache with snapshot data
            → Dashboard views render with initial state
```

**2. Real-Time Event Flow**
```
OpenClaw Gateway → EventFrame (agent|chat|cron|health|presence)
  → WebSocketProvider.onMessage
    → EventDispatcher routes by event.event field
      → Subscribers (useAgentEvents, useChatEvents, etc.)
        → Update local state or invalidate TanStack Query cache
          → React re-renders affected components
```

**3. User Action Flow (e.g., "Kill Session")**
```
Session Manager → User clicks "Kill"
  → rpcClient.call("agent.kill", { sessionId })
    → WebSocketProvider sends RequestFrame
      → OpenClaw processes, sends ResponseFrame
        → Promise resolves or rejects
          → TanStack Query invalidates sessions list
            → Refetch triggers, UI updates
              → EventDispatcher may also receive agent.event confirming termination
```

**4. Chat Message Flow**
```
Chat Input → User submits message
  → rpcClient.call("chat.inject", { message, context })
    → OpenClaw Gateway forwards to agent
      → EventDispatcher receives chat.event (assistant response chunks)
        → Chat Interface appends to message list
          → Widget Registry renders structured data (tables, code, charts)
```

## Patterns to Follow

### Pattern 1: Singleton WebSocket via Context
**What:** Single WebSocket connection shared across entire app via React Context.

**When:** Always. Multiple WebSocket connections waste resources and cause state divergence.

**Example:**
```typescript
// contexts/websocket-context.tsx
"use client"

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { GatewayClient } from '@/lib/gateway-client'

const WebSocketContext = createContext<GatewayClient | null>(null)

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const clientRef = useRef<GatewayClient | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!clientRef.current) {
      clientRef.current = new GatewayClient({
        url: 'ws://localhost:18789',
        onEvent: (evt) => { /* distribute to subscribers */ },
        onHelloOk: (hello) => { /* populate initial state */ },
        onClose: () => setIsConnected(false),
      })
      clientRef.current.start()
    }

    return () => {
      clientRef.current?.close()
      clientRef.current = null
    }
  }, [])

  return (
    <WebSocketContext.Provider value={clientRef.current}>
      {children}
    </WebSocketContext.Provider>
  )
}

export function useGatewayClient() {
  const client = useContext(WebSocketContext)
  if (!client) throw new Error('useGatewayClient must be used within WebSocketProvider')
  return client
}
```

**Source:** [Socket.IO Connection with Custom React Hook in Next.js by Singleton Design Pattern](https://github.com/mahmodghnaj/wrapping-socket-with-nextJs)

### Pattern 2: Reconnection with Exponential Backoff
**What:** Automatically reconnect on disconnect with increasing delays to avoid hammering server.

**When:** Production deployments, server restarts, network instability.

**Example:**
```typescript
class GatewayClient {
  private backoffMs = 1000
  private maxBackoffMs = 30000

  private reconnect() {
    setTimeout(() => {
      this.start()
      this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs)
    }, this.backoffMs)
  }

  onClose() {
    if (!this.closed) {
      this.reconnect()
    }
  }

  onOpen() {
    this.backoffMs = 1000 // reset on successful connection
  }
}
```

**Source:** [React WebSocket Connection Management Best Practices 2026](https://ably.com/blog/websockets-react-tutorial)

### Pattern 3: Server State in TanStack Query, Client State in Zustand
**What:** Separate concerns: TanStack Query for data from OpenClaw (sessions, cron, usage), Zustand for local UI state (filters, selected items, preferences).

**When:** All data flows. Don't put server state in Zustand or UI state in TanStack Query.

**Example:**
```typescript
// Server state: sessions list from gateway
const { data: sessions } = useQuery({
  queryKey: ['sessions'],
  queryFn: () => rpcClient.call('sessions.list', {}),
  refetchInterval: 10000, // background refresh
})

// Client state: which session is selected
const selectedSessionId = useStore((state) => state.selectedSessionId)
```

**Rationale:** TanStack Query handles loading states, caching, background refetch, and stale-while-revalidate patterns. Zustand is lightweight for local state. In 2026, 80% of server-state patterns use TanStack Query while Zustand sees 40% adoption for client state.

**Source:** [State Management in 2026: Redux, Context API, and Modern Patterns](https://www.nucamp.co/blog/state-management-in-2026-redux-context-api-and-modern-patterns)

### Pattern 4: Event-Driven Cache Invalidation
**What:** When EventFrame arrives (e.g., agent.event), invalidate TanStack Query cache to trigger refetch.

**When:** Any real-time event that affects cached data.

**Example:**
```typescript
const queryClient = useQueryClient()

useEffect(() => {
  const unsubscribe = eventDispatcher.subscribe('agent', (event) => {
    queryClient.invalidateQueries({ queryKey: ['sessions'] })
  })
  return unsubscribe
}, [])
```

**Rationale:** Keeps UI in sync with server events without manual polling. Combines push events with pull queries.

**Source:** [TanStack Query and WebSockets: Real-time React data fetching](https://blog.logrocket.com/tanstack-query-websockets-real-time-react-data-fetching/)

### Pattern 5: Pluggable Chat Widget Rendering
**What:** Chat messages can contain structured data (tables, charts, code blocks). Widget registry maps message types to renderer components.

**When:** Rendering chat messages with rich content beyond plain text.

**Example:**
```typescript
// lib/chat-widgets.tsx
const widgetRegistry = {
  'code-block': CodeBlockWidget,
  'table': TableWidget,
  'chart': ChartWidget,
  'task-card': TaskCardWidget,
}

function ChatMessage({ message }) {
  const widgetType = detectWidgetType(message.content)
  const Widget = widgetRegistry[widgetType] || PlainTextWidget
  return <Widget content={message.content} />
}
```

**Rationale:** Voiceflow's Chat UI Kit supports custom component rendering for Custom Action steps. Modern chat architectures are modular, allowing greater customizability.

**Source:** [React Chat Widget Architecture 2026](https://docs.voiceflow.com/docs/react-chat)

### Pattern 6: Type-Safe RPC Client with Method Registry
**What:** Generate TypeScript types for all 80+ gateway methods from OpenClaw's protocol schemas.

**When:** Building the RPC client wrapper.

**Example:**
```typescript
// lib/rpc-client.ts
import type { GatewayMethods } from '@/types/gateway-protocol'

class RPCClient {
  async call<M extends keyof GatewayMethods>(
    method: M,
    params: GatewayMethods[M]['params']
  ): Promise<GatewayMethods[M]['result']> {
    const requestId = randomUUID()
    const frame: RequestFrame = { id: requestId, method, params }

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject })
      this.ws.send(JSON.stringify(frame))
    })
  }
}
```

**Rationale:** OpenClaw's gateway uses TypeBox schemas. Extract types for compile-time safety. Prevents typos in method names and parameter mismatches.

**Source:** OpenClaw source code (`src/gateway/protocol/schema/types.ts`)

### Pattern 7: Feature-Based Folder Structure
**What:** Organize code by feature domain (sessions, cron, chat, analytics, tasks) instead of technical role (components, hooks, utils).

**When:** Structuring the Next.js app directory.

**Example:**
```
src/
  app/
    (dashboard)/           # route group, excludes "(dashboard)" from URL
      layout.tsx           # shared layout with WebSocketProvider
      sessions/
        page.tsx           # sessions list view
        [id]/
          page.tsx         # session detail view
      cron/
        page.tsx
      chat/
        page.tsx
      analytics/
        page.tsx
      tasks/
        page.tsx
  features/
    sessions/
      components/          # SessionCard, SessionList, KillButton
      hooks/               # useSessions, useSessionEvents
      types.ts             # Session, SessionStatus
    cron/
      components/
      hooks/
      types.ts
    chat/
      components/          # ChatInput, MessageList, WidgetRenderer
      hooks/               # useChat, useChatEvents
      widgets/             # CodeBlock, Table, Chart
      types.ts
  lib/
    gateway-client.ts      # WebSocket RPC client
    rpc-client.ts          # Type-safe method wrapper
    event-dispatcher.ts    # Event routing
  contexts/
    websocket-context.tsx
  types/
    gateway-protocol.ts    # Generated from OpenClaw schemas
```

**Rationale:** Co-location keeps related files together. If a component is only used in one feature, it lives in that feature's directory. Next.js 15 allows route groups with `(name)` to organize without affecting URLs.

**Source:** [Best Practices for Organizing Your Next.js 15 2025](https://dev.to/bajrayejoon/best-practices-for-organizing-your-nextjs-15-2025-53ji)

## Anti-Patterns to Avoid

### Anti-Pattern 1: Multiple WebSocket Connections
**What:** Creating a new WebSocket connection in each component that needs real-time data.

**Why bad:** Wastes server resources, multiplies network traffic, causes state desynchronization when different connections receive events in different order.

**Instead:** Use singleton pattern via Context. All components share one connection.

**Source:** [Best Practices of using WebSockets in React](https://medium.com/@tusharkumar27864/best-practices-of-using-websockets-real-time-communication-in-react-native-projects-89e749ba2e3f)

### Anti-Pattern 2: Storing Server State in Zustand
**What:** Fetching sessions from gateway, storing in Zustand, manually refetching on events.

**Why bad:** Zustand doesn't handle loading states, stale data, background refetch, or cache invalidation. You end up reimplementing TanStack Query poorly.

**Instead:** Server state in TanStack Query, client state in Zustand. TanStack Query is specifically designed for server state with built-in staleness, caching, and refetching.

**Source:** [Zustand vs. TanStack Query: React State Management](https://medium.com/@imranrafeek/zustand-vs-rtk-query-vs-tanstack-query-unpacking-the-react-state-management-toolbox-d47893479742)

### Anti-Pattern 3: Polling Instead of Event-Driven Updates
**What:** Setting `refetchInterval: 1000` on every query to get "real-time" updates.

**Why bad:** Wastes bandwidth, increases server load, introduces latency (average 500ms behind), still misses events between polls.

**Instead:** Use EventDispatcher to invalidate queries when relevant events arrive. Combine push (events) with pull (queries).

**Source:** [TanStack Query and WebSockets](https://github.com/TanStack/query/discussions/1519)

### Anti-Pattern 4: Rendering Chat Messages as Plain Text
**What:** Displaying all chat messages as text, even when content contains structured data (tables, code, JSON).

**Why bad:** Poor UX. Users can't scan structured data easily. Loses semantic meaning.

**Instead:** Implement pluggable widget system. Detect content type (markdown code fences, JSON objects, CSV) and render with appropriate component.

**Source:** [React Chat Widget Custom Components](https://docs.voiceflow.com/docs/react-chat)

### Anti-Pattern 5: Server Components for Real-Time Views
**What:** Trying to render session list as Server Component, polling every few seconds.

**Why bad:** Server Components can't use WebSocket events, can't hold client state, can't use useEffect. You lose the real-time advantage.

**Instead:** Use Server Components for static layout/shell, Client Components (`"use client"`) for real-time data views. Mark the boundary explicitly.

**Source:** [Next.js 15 App Router: Server and Client Components](https://dev.to/devjordan/nextjs-15-app-router-complete-guide-to-server-and-client-components-5h6k)

### Anti-Pattern 6: No Reconnection Strategy
**What:** WebSocket disconnects, app shows error, requires page reload to reconnect.

**Why bad:** Poor UX during network hiccups or server restarts. Users lose work.

**Instead:** Implement automatic reconnection with exponential backoff. Max backoff 30s. Reset backoff on successful connection.

**Source:** [React WebSocket Reconnection Best Practices](https://github.com/pladaria/reconnecting-websocket)

### Anti-Pattern 7: Global "Loading" State for All RPC Calls
**What:** Single `isLoading` flag in Zustand that blocks entire UI during any RPC call.

**Why bad:** Kills perceived performance. User can't interact with unrelated features while one operation is in flight.

**Instead:** TanStack Query handles per-query loading states. Each view shows loading spinners only for its own data.

**Source:** [How to Use React Query for Server State Management](https://oneuptime.com/blog/post/2026-01-15-react-query-tanstack-server-state/view)

## Build Order Recommendations

### Phase 1: WebSocket Foundation
**Dependencies:** None
**Components to build:**
1. GatewayClient class (WebSocket wrapper, reconnection, heartbeat)
2. WebSocketProvider context
3. Type definitions from OpenClaw schemas
4. Basic connection status indicator

**Why first:** Everything depends on the WebSocket connection. Build and test this in isolation before adding features.

**Validation:** Connect to gateway, receive HelloOk, handle reconnection on manual disconnect.

---

### Phase 2: RPC Client Layer
**Dependencies:** Phase 1
**Components to build:**
1. RPCClient class (request/response correlation)
2. Type-safe method wrappers for core methods (sessions.*, agent.*)
3. Error handling (timeouts, malformed responses)
4. Simple test UI: call `sessions.list`, display raw JSON

**Why second:** Establishes the communication pattern before building features.

**Validation:** Successfully call 5+ methods, handle errors, timeout after 30s.

---

### Phase 3: Event Dispatcher
**Dependencies:** Phase 1
**Components to build:**
1. EventDispatcher class (subscribe/unsubscribe by event type)
2. Hook: `useGatewayEvents(eventType, handler)`
3. Test UI: subscribe to `agent` events, log to console

**Why third:** Real-time updates depend on event routing. Build before views need it.

**Validation:** Receive agent.event when OpenClaw session starts, route to subscriber.

---

### Phase 4: State Management Integration
**Dependencies:** Phases 1-3
**Components to build:**
1. TanStack Query setup with queryClient
2. First query: `useSessions()` hook
3. Event-driven invalidation: `agent` event → invalidate sessions query
4. Zustand store for UI state (selected session, filters)

**Why fourth:** Proves the state management architecture works before building complex views.

**Validation:** Sessions list updates when agent.event arrives, no manual refetch.

---

### Phase 5: Sessions View
**Dependencies:** Phase 4
**Components to build:**
1. Session list component (displays active sessions)
2. Session card (model, status, token count)
3. Kill button (calls `agent.kill`)
4. Optimistic update: mark killed before server confirms

**Why fifth:** First real feature. Sessions are core to dashboard value.

**Validation:** See live sessions, kill works, UI updates immediately.

---

### Phase 6: Cron View
**Dependencies:** Phase 4
**Components to build:**
1. Cron list (jobs, status, next run)
2. Manual trigger button (calls `cron.run`)
3. History panel (calls `cron.runs`)
4. Subscribe to cron events for status updates

**Why sixth:** Independent from sessions, validates pattern reuse.

**Validation:** Trigger cron job, see status update in real-time.

---

### Phase 7: Chat Interface
**Dependencies:** Phases 3-4
**Components to build:**
1. Message list (scrollable, auto-scroll to bottom)
2. Chat input (send button, calls `chat.inject`)
3. Subscribe to `chat` events, append assistant messages
4. Plain text rendering first (no widgets yet)

**Why seventh:** More complex than list views, needs event handling.

**Validation:** Send message, receive response, messages persist across navigation.

---

### Phase 8: Chat Widgets
**Dependencies:** Phase 7
**Components to build:**
1. Widget registry (maps content patterns to components)
2. CodeBlock widget (syntax highlighting)
3. Table widget (CSV/JSON tables)
4. Content detection logic (markdown fences, JSON objects)

**Why eighth:** Extends chat without changing core architecture.

**Validation:** Assistant sends table, renders as HTML table not plain text.

---

### Phase 9: Analytics Dashboard
**Dependencies:** Phase 2
**Components to build:**
1. Usage query hooks (`usage.tokens`, `usage.costs`)
2. Time range selector (daily/weekly/monthly)
3. Charts (token trends, model distribution)
4. Cost breakdown by session

**Why ninth:** Data-heavy, benefits from proven TanStack Query patterns.

**Validation:** View token usage for last 7 days, group by model.

---

### Phase 10: Task Board (Local Storage MVP)
**Dependencies:** None (local-first)
**Components to build:**
1. Zustand store for tasks (id, title, status, priority)
2. Kanban columns (To Do, In Progress, Done)
3. Drag-and-drop (dnd-kit)
4. LocalStorage persistence

**Why tenth:** Can be built independently, validates local state patterns.

**Validation:** Create task, drag to "Done", survives page reload.

---

### Phase 11: Project/Workspace Organization
**Dependencies:** Phase 10
**Components to build:**
1. Project model (id, name, tasks[], crons[], chats[])
2. Project selector in sidebar
3. Filter views by active project
4. Manual tagging UI (assign task/cron/chat to project)

**Why eleventh:** Ties features together, requires understanding all data models.

**Validation:** Create project, assign cron job, filter cron view by project.

---

### Phase 12: Task Integration with OpenClaw
**Dependencies:** Phase 10-11
**Research needed:** How to store tasks in OpenClaw domain?
**Options to explore:**
1. OpenClaw memory system (key-value store per session)
2. Custom plugin (register gateway methods: `tasks.*`)
3. Propose native task support to OpenClaw

**Why last:** Requires coordination with OpenClaw architecture, may need upstream changes.

**Validation:** Ada creates task via chat, appears in The Trap's task board.

---

## Scalability Considerations

| Concern | Single User (Current) | Multi-User (Future) | Multi-Instance OpenClaw |
|---------|----------------------|---------------------|------------------------|
| **WebSocket Connection** | One client, one connection to localhost:18789 | One connection per user, authenticate with device token | Connection pool or gateway proxy |
| **State Synchronization** | TanStack Query cache per browser tab | Shared cache via broadcast channel or server-sent events | Each instance has own gateway, UI switches between instances |
| **Task Storage** | LocalStorage or Zustand (single browser) | SQLite on server or OpenClaw plugin | Tasks scoped to OpenClaw instance ID |
| **Authentication** | None (localhost) | Device pairing flow, JWT tokens | Per-instance device auth |
| **Real-time Events** | Direct EventFrame routing | Multiplex events to multiple clients | UI subscribes to selected instance's events |

**Recommendation:** Build for single user first. The architecture (singleton WebSocket, TanStack Query, event dispatcher) supports multi-user with these additions:
1. Device authentication (OpenClaw already supports this)
2. User session management (JWT in cookies)
3. Server-side event broadcasting (if multiple tabs need sync)
4. Task storage in OpenClaw domain (plugin or memory system)

The core architecture doesn't need changes, just extensions.

## Technology Choices

| Category | Technology | Why | Confidence |
|----------|-----------|-----|------------|
| **WebSocket Client** | Native browser WebSocket API + custom wrapper | OpenClaw gateway uses standard WebSocket, not Socket.IO. Custom wrapper gives full control over reconnection and RPC protocol. | HIGH |
| **RPC Library** | Custom (based on OpenClaw's client.ts) | OpenClaw has well-defined RequestFrame/ResponseFrame/EventFrame protocol. Adapt their Node.js client for browser. Minimal dependencies. | HIGH |
| **Server State** | TanStack Query v5 | Industry standard for server state in 2026 (80% of projects). Handles caching, background refetch, optimistic updates out of the box. | HIGH |
| **Client State** | Zustand v5 | Lightweight (40% adoption in 2026), simple API, works well with TanStack Query. No boilerplate compared to Redux. | HIGH |
| **Real-time Patterns** | Event-driven cache invalidation | Combines WebSocket push (events) with TanStack Query pull (queries). Avoids polling, stays in sync. | HIGH |
| **Chat Widgets** | Custom registry + shadcn/ui components | React-chat-widget packages are too opinionated. Build slim registry with shadcn for flexibility. | MEDIUM |
| **Drag-and-Drop** | dnd-kit | Modern, accessible, works with React 19. Better than react-beautiful-dnd (no longer maintained). | HIGH |
| **Charts** | Recharts or shadcn/chart | Recharts integrates with shadcn. Good balance of features and bundle size. | MEDIUM |

## Sources

### HIGH Confidence Sources (Official Documentation)
- Next.js App Router Documentation: https://nextjs.org/docs/app
- TanStack Query Documentation: https://tanstack.com/query/latest
- OpenClaw Gateway Source Code: `/home/dan/src/openclaw/src/gateway/`

### MEDIUM Confidence Sources (Verified Patterns)
- [Next.js Architecture in 2026 — Server-First, Client-Islands](https://www.yogijs.tech/blog/nextjs-project-architecture-app-router)
- [State Management in 2026: Redux, Context API, and Modern Patterns](https://www.nucamp.co/blog/state-management-in-2026-redux-context-api-and-modern-patterns)
- [TanStack Query and WebSockets: Real-time React data fetching](https://blog.logrocket.com/tanstack-query-websockets-real-time-react-data-fetching/)
- [React WebSocket Connection Management Best Practices](https://ably.com/blog/websockets-react-tutorial)
- [Best Practices for Organizing Your Next.js 15 2025](https://dev.to/bajrayejoon/best-practices-for-organizing-your-nextjs-15-2025-53ji)
- [Socket.IO Connection with Singleton Pattern](https://github.com/mahmodghnaj/wrapping-socket-with-nextJs)
- [Zustand vs. TanStack Query Comparison](https://medium.com/@imranrafeek/zustand-vs-rtk-query-vs-tanstack-query-unpacking-the-react-state-management-toolbox-d47893479742)
- [React Chat Widget Architecture](https://docs.voiceflow.com/docs/react-chat)

### Referenced Libraries
- rpc-websockets (JSON RPC 2.0 over WebSocket): https://github.com/elpheria/rpc-websockets
- reconnecting-websocket: https://github.com/pladaria/reconnecting-websocket
- react-use-websocket: https://www.npmjs.com/package/react-use-websocket
