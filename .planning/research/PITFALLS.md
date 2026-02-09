# Domain Pitfalls

**Domain:** Real-time dashboard/control center (WebSocket-heavy Next.js 15 App)
**Researched:** 2026-02-02
**Context:** Replacing OpenClaw Control UI - focus on avoiding the mistakes that made it "ugly, slow, and missing features"

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: WebSocket Connection Not Properly Cleaned Up in useEffect

**What goes wrong:** Memory usage climbs from 200MB to 2GB+ after leaving pages open for extended periods. WebSocket connections remain active after component unmounts, creating zombie connections that continuously wait for events.

**Why it happens:** Developers forget to return cleanup functions from useEffect, or they create WebSocket connections without closing them when components unmount. In Next.js App Router, Server Components being re-rendered on every navigation can create new WebSocket connections without closing old ones.

**Consequences:**
- Browser memory exhaustion after extended use
- Multiple simultaneous connections to the same endpoint
- Degraded performance over time
- In production scenarios like financial dashboards with real-time price feeds, hundreds of simultaneous connections accumulate

**Prevention:**
```typescript
useEffect(() => {
  const socket = new WebSocket('ws://...');

  socket.onmessage = (event) => {
    // Handle messages
  };

  // CRITICAL: Return cleanup function
  return () => {
    socket.close();
  };
}, []);
```

**Detection:**
- Monitor browser memory usage in DevTools Performance tab during extended sessions
- Check Network tab for multiple WebSocket connections to same endpoint
- Look for memory not being reclaimed after navigating away from pages
- Profile with Chrome's Memory Snapshot - look for detached DOM nodes with event listeners

**Sources:**
- [Memory Leaks in React & Next.js: What Nobody Tells You (Jan 2026)](https://medium.com/@essaadani.yo/memory-leaks-in-react-next-js-what-nobody-tells-you-91c72b53d84d)
- [Memory Leak Prevention in Next.js](https://medium.com/@nextjs101/memory-leak-prevention-in-next-js-47b414907a43)
- [5 React Memory Leaks That Kill Performance](https://www.codewalnut.com/insights/5-react-memory-leaks-that-kill-performance)

---

### Pitfall 2: Next.js 15 Over-Caching Real-Time Data

**What goes wrong:** Dashboard displays stale session data, cost analytics, or cron status because Next.js aggressively cached the initial fetch. Users see outdated information even though WebSocket events are firing.

**Why it happens:** Next.js's caching model (introduced in v13) defaults to aggressive caching. Even though Next.js 15 changed some defaults, the interaction between Data Cache, Full Route Cache, and Router Cache is complex. The Router Cache has a minimum 30-second stale time regardless of configuration, and cache entries expire after 30 seconds for static routes or 5 minutes for dynamic routes.

**Consequences:**
- Mismatches between backend state and displayed data
- Users making decisions based on stale information
- Frustratingly inconsistent behavior where some data is fresh and some is stale
- Real-time updates appearing to "not work" because initial render shows cached data

**Prevention:**
```typescript
// Option 1: Force dynamic rendering for the entire route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Option 2: Use Dynamic IO (experimental in Next.js 15)
// Flips the caching model - opts out by default
export const experimental_dynamicIO = true;

// Option 3: Explicit cache control on fetch
fetch('...', { cache: 'no-store' });
```

**Detection:**
- Data not updating immediately after page navigation
- WebSocket messages arriving but UI not reflecting changes
- Different users seeing different data at the same time
- Console log timestamps showing data from minutes/hours ago

**Phase mapping:** Address in Phase 1 (Foundation) - set route segment config immediately to avoid building on cached assumptions.

**Sources:**
- [Next.js 15 Upgrade Playbook: Caching Pitfalls](https://dev.to/sumeet_shrofffreelancer_/nextjs-15-upgrade-playbook-app-router-caching-pitfalls-and-safe-migration-steps-1opa)
- [Fix over-caching with Dynamic IO caching in Next.js 15](https://blog.logrocket.com/dynamic-io-caching-next-js-15/)
- [Deep Dive: Caching and Revalidating](https://github.com/vercel/next.js/discussions/54075)

---

### Pitfall 3: SSR/Hydration Mismatch with Real-Time Data

**What goes wrong:** "Text content does not match server-rendered HTML" errors, or worse - silent mismatches where the server renders initial state but client immediately receives WebSocket updates, causing visual flicker or incorrect initial renders.

**Why it happens:** Server components render with database snapshot, but by the time the client hydrates, WebSocket has delivered newer data. Using browser-only APIs (window, localStorage) in rendering logic. Not making a shallow copy of server data before using it as useState initial state.

**Consequences:**
- React hydration errors in console
- Visual flicker on page load
- Users see wrong data for a split second
- In worst case, React bails on hydration and re-renders everything client-side, killing performance

**Prevention:**
```typescript
// Pattern 1: Shallow copy server data before using as state
const [messages, setMessages] = useState(() => [...initialMessages]);

// Pattern 2: Use client-only components for real-time features
'use client';
import dynamic from 'next/dynamic';

const RealtimeWidget = dynamic(
  () => import('@/components/RealtimeWidget'),
  { ssr: false }
);

// Pattern 3: Separate static shell from dynamic content
// Server component renders layout/structure
// Client component handles WebSocket and real-time updates
```

**Detection:**
- Console warnings about hydration mismatch
- Content "jumping" on initial page load
- Data appearing then disappearing then reappearing
- Different content in View Source vs DevTools Elements tab

**Phase mapping:** Address in Phase 1 (Foundation) - establish client/server boundary patterns before building features.

**Sources:**
- [Next.js App Router WebSocket Integration Challenges](https://github.com/vercel/next.js/discussions/58698)
- [Text content does not match server-rendered HTML](https://nextjs.org/docs/messages/react-hydration-error)
- [Staying Hydrated with React and Next.js](https://dev.to/austinwdigital/staying-hydrated-with-react-and-nextjs-3cj3)

---

### Pitfall 4: Massive Re-renders from Global WebSocket State

**What goes wrong:** Dashboard with 1000+ tasks re-renders 50+ times per user interaction. Every WebSocket message triggers re-render of entire component tree. Charts, lists, and widgets all re-render even when their data hasn't changed.

**Why it happens:** Storing all WebSocket state in a single global context or Redux store. Every state update triggers re-render of all consumers. Not using memoization for child components. Passing new object/function references on every render.

**Consequences:**
- UI feels sluggish and unresponsive
- High Interaction to Next Paint (INP) metrics
- Battery drain on mobile devices
- Users perceive the app as "slow" even though data arrives quickly

**Prevention:**
```typescript
// Anti-pattern: Single global state
const GlobalContext = createContext({ sessions: [], tasks: [], costs: [] });

// Better: Separate contexts by domain
const SessionContext = createContext([]);
const TaskContext = createContext([]);
const CostContext = createContext([]);

// Best: Fine-grained state with memoization
const SessionList = memo(({ sessions }) => {
  return sessions.map(session => <SessionRow key={session.id} session={session} />);
});

// Use useMemo for computed values
const filteredSessions = useMemo(
  () => sessions.filter(s => s.active),
  [sessions]
);

// Use useCallback for event handlers passed to children
const handleKill = useCallback((sessionId) => {
  // ...
}, []);
```

**Detection:**
- React DevTools Profiler showing hundreds of renders per interaction
- Components re-rendering even though their props haven't changed
- Noticeable lag when typing or clicking
- Performance timeline showing long tasks (>50ms)

**Phase mapping:** Address in Phase 2 (Real-time Foundation) - establish state management patterns before adding complex features. May need deeper research in Phase 5 (Analytics Dashboard).

**Sources:**
- [React Rendering Bottleneck: How I Cut Re-renders by 60% in a Complex Dashboard](https://medium.com/@sosohappy/react-rendering-bottleneck-how-i-cut-re-renders-by-60-in-a-complex-dashboard-ed14d5891c72)
- [React.js Optimization Every React Developer Must Know (2026 Edition)](https://medium.com/@muhammadshakir4152/react-js-optimization-every-react-developer-must-know-2026-edition-e1c098f55ee9)
- [Optimizing React Performance By Preventing Unnecessary Re-renders](https://www.debugbear.com/blog/react-rerenders)

---

### Pitfall 5: WebSocket State Synchronization Issues Across Multiple Connections

**What goes wrong:** Multi-instance deployment (even single-user app might have multiple tabs open) causes state inconsistencies. Session killed in one tab still shows as active in another. Cost data differs between dashboard views.

**Why it happens:** Each browser tab/window creates its own WebSocket connection. No mechanism to sync state across connections. Race conditions when the same action is triggered from multiple tabs. Distributed system consistency is hard - maintaining consistent state between multiple connections to the same backend is a complex problem.

**Consequences:**
- Confusing UX where different tabs show different states
- Actions taken based on stale state in one tab
- Race conditions leading to duplicate kills/actions
- Data integrity issues

**Prevention:**
```typescript
// Pattern 1: Use BroadcastChannel API for cross-tab sync
const channel = new BroadcastChannel('clutch-state');

channel.addEventListener('message', (event) => {
  // Update local state when other tabs broadcast changes
  updateLocalState(event.data);
});

// When state changes locally, broadcast to other tabs
const handleStateChange = (newState) => {
  setState(newState);
  channel.postMessage(newState);
};

// Pattern 2: Single source of truth - server reconciliation
// On reconnect or periodic interval, fetch full state from server
const reconcileState = async () => {
  const serverState = await fetch('/api/state').then(r => r.json());
  setState(serverState);
};

// Pattern 3: Optimistic updates with server confirmation
const killSession = async (sessionId) => {
  // Optimistically update UI
  setSessions(prev => prev.filter(s => s.id !== sessionId));

  // Wait for server confirmation via WebSocket event
  // If no confirmation after timeout, rollback
  setTimeout(() => {
    if (!confirmed) {
      // Rollback - re-fetch state
      reconcileState();
    }
  }, 5000);
};
```

**Detection:**
- Open app in two browser tabs, perform action in one, see stale state in other
- WebSocket messages arriving but state not updating consistently
- Users reporting "ghost" sessions that can't be killed
- Inconsistent data between dashboard widgets

**Phase mapping:** Address in Phase 2 (Real-time Foundation) - establish multi-tab sync patterns early. Critical for Phase 3 (Session Management) where kill actions must be reliable.

**Sources:**
- [WebSocket State Synchronization](https://oneuptime.com/blog/post/2026-01-24-websocket-reconnection-logic/view)
- [WebSocket architecture best practices](https://ably.com/topic/websocket-architecture-best-practices)
- [Solving eventual consistency in frontend](https://blog.logrocket.com/solving-eventual-consistency-frontend/)

---

### Pitfall 6: Missing WebSocket Reconnection Logic

**What goes wrong:** User's laptop sleeps or network briefly disconnects. WebSocket closes. Dashboard shows stale data indefinitely. No automatic recovery. User must manually refresh page.

**Why it happens:** Native WebSocket API doesn't provide automatic reconnection. Developers implement basic connection but forget to handle disconnection/reconnection lifecycle. Reconnection logic is complex - need exponential backoff, message queuing, state recovery.

**Consequences:**
- Dashboard appears to be working but is showing stale data
- Silent failures - user doesn't know they're disconnected
- Lost events during disconnection period
- Session/task state drift from reality

**Prevention:**
```typescript
// Pattern 1: Exponential backoff reconnection
let reconnectDelay = 1000;
const maxDelay = 30000;

const connect = () => {
  const socket = new WebSocket('ws://...');

  socket.onclose = () => {
    // Attempt reconnect with exponential backoff
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
      connect();
    }, reconnectDelay);
  };

  socket.onopen = () => {
    reconnectDelay = 1000; // Reset on successful connection
    reconcileState(); // Fetch full state to catch up on missed events
  };
};

// Pattern 2: Use library with built-in reconnection
// Socket.IO provides automatic reconnection and packet buffering
import { io } from 'socket.io-client';

const socket = io('ws://...', {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity
});

// Pattern 3: Visual connection status indicator
const [connectionStatus, setConnectionStatus] = useState('connected');

socket.onclose = () => setConnectionStatus('disconnected');
socket.onopen = () => setConnectionStatus('connected');

// Show banner when disconnected
{connectionStatus === 'disconnected' && (
  <Alert>Connection lost. Attempting to reconnect...</Alert>
)}
```

**Detection:**
- Disconnect network in DevTools, observe behavior
- Put laptop to sleep, wake up, check if data updates
- Check Network tab - is WebSocket status "closed"?
- Look for errors in console when network drops

**Phase mapping:** Address in Phase 2 (Real-time Foundation) - build reconnection logic before features depend on it.

**Sources:**
- [How to Handle WebSocket Reconnection Logic (Jan 2026)](https://oneuptime.com/blog/post/2026-01-24-websocket-reconnection-logic/view)
- [WebSocket architecture best practices](https://ably.com/topic/websocket-architecture-best-practices)
- [Streaming in Next.js 15: WebSockets vs Server-Sent Events](https://www.rickyspears.com/technology/streaming-in-next-js-15-websockets-vs-server-sent-events-a-comprehensive-guide/)

---

## Moderate Pitfalls

Mistakes that cause delays or technical debt.

### Pitfall 7: Chat Auto-Scroll Fighting User Scrolling

**What goes wrong:** User scrolls up to read previous messages. Streaming message arrives. UI auto-scrolls to bottom, interrupting reading. User scrolls up again. Another chunk arrives. Auto-scroll again. Frustrating bounce effect.

**Why it happens:** Naive implementation always scrolls to bottom when new content arrives. No detection of user's scroll position or intent. Streaming content triggers continuous scroll updates.

**Prevention:**
```typescript
const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
const messagesEndRef = useRef(null);
const containerRef = useRef(null);

// Detect if user has scrolled up
const handleScroll = () => {
  const container = containerRef.current;
  const isAtBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight < 50;
  setShouldAutoScroll(isAtBottom);
};

// Only auto-scroll if user is at bottom
useEffect(() => {
  if (shouldAutoScroll) {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }
}, [messages, shouldAutoScroll]);

// Alternative: Invisible anchor element pattern
<div ref={containerRef} onScroll={handleScroll}>
  {messages.map(msg => <Message key={msg.id} {...msg} />)}
  {shouldAutoScroll && <div ref={messagesEndRef} />}
</div>
```

**Detection:**
- Scroll up in chat while messages are streaming
- UI should stay at scroll position, not jump to bottom
- Should show "New messages" indicator when scrolled up

**Phase mapping:** Address in Phase 4 (Chat Interface) when implementing message streaming.

**Sources:**
- [Intuitive Scrolling for Chatbot Message Streaming](https://tuffstuff9.hashnode.dev/intuitive-scrolling-for-chatbot-message-streaming)
- [Auto-scrolling in chat can fight against user scrolling](https://github.com/posit-dev/py-shiny/issues/1988)
- [Streaming chat scroll to bottom with React](https://davelage.com/posts/chat-scroll-react/)

---

### Pitfall 8: Testing WebSocket Features Without Proper Mocks

**What goes wrong:** WebSocket-driven features are untested because "it's too hard to test real-time stuff." Tests that do exist are flaky, timing-dependent, or require running the actual backend. Coverage gaps lead to bugs in production.

**Why it happens:** Developers don't know about WebSocket mocking libraries. Attempting to test against real WebSocket servers creates brittle, slow tests. Timing issues with async messages.

**Prevention:**
```typescript
// Use jest-websocket-mock for testing
import WS from 'jest-websocket-mock';
import { render, screen, waitFor } from '@testing-library/react';

test('displays session when WebSocket message arrives', async () => {
  const server = new WS('ws://localhost:1234');

  render(<SessionList />);

  // Send mock WebSocket message
  server.send(JSON.stringify({
    type: 'session.created',
    data: { id: '123', status: 'running' }
  }));

  // Verify UI updates
  await waitFor(() => {
    expect(screen.getByText('Session 123')).toBeInTheDocument();
  });

  server.close();
});

// Alternative: Custom mock with state tracking
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = WebSocket.CONNECTING;
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  send(data) {
    this.lastSent = data;
  }

  simulateMessage(data) {
    this.onmessage?.({ data });
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.();
  }
}
```

**Detection:**
- Low test coverage on real-time features
- Tests skipped or marked as TODO
- Manual testing required for every change
- Bugs in WebSocket handling discovered in production

**Phase mapping:** Establish testing patterns in Phase 1 (Foundation), expand in Phase 2 (Real-time Foundation).

**Sources:**
- [jest-websocket-mock](https://github.com/romgain/jest-websocket-mock)
- [Testing in 2026: Jest, React Testing Library, and Full Stack Testing Strategies](https://www.nucamp.co/blog/testing-in-2026-jest-react-testing-library-and-full-stack-testing-strategies)
- [JavaScript testing: Mocking WebSockets using the mock-socket library](https://wanago.io/2022/08/08/javascript-testing-mocking-websockets-mock-socket/)

---

### Pitfall 9: Recharts Performance Ceiling with Real-Time Cost Analytics

**What goes wrong:** Cost analytics chart with time-series data (hundreds of data points) causes browser lag, freezing, or slow rendering. Chart updates lag behind incoming WebSocket data.

**Why it happens:** Recharts renders everything as SVG nodes. A chart with 5,000+ points creates 5,000+ DOM elements, causing "layout thrashing." Recharts is designed for low-density, high-fidelity dashboards with <100 data points. Not using memoization for data transformations. Re-rendering entire chart when only new data point added.

**Consequences:**
- Sluggish chart interactions (zoom, pan, hover)
- Browser freezing when rendering large datasets
- Poor UX for real-time analytics
- Users avoid using analytics features due to performance

**Prevention:**
```typescript
// Pattern 1: Data point limiting
const MAX_POINTS = 100;
const displayData = useMemo(() => {
  // Show every Nth point or use moving average
  return rawData.length > MAX_POINTS
    ? rawData.filter((_, i) => i % Math.ceil(rawData.length / MAX_POINTS) === 0)
    : rawData;
}, [rawData]);

// Pattern 2: Memoize dataKey and functions
const CustomTooltip = useCallback(({ active, payload }) => {
  if (!active) return null;
  return <div>{payload[0].value}</div>;
}, []);

const MemoizedChart = useMemo(() => (
  <LineChart data={displayData}>
    <Line dataKey="cost" />
  </LineChart>
), [displayData]);

// Pattern 3: Throttle updates for real-time data
const [chartData, setChartData] = useState([]);

useEffect(() => {
  const throttledUpdate = throttle((newData) => {
    setChartData(newData);
  }, 1000); // Update max once per second

  socket.on('cost.update', throttledUpdate);

  return () => {
    socket.off('cost.update', throttledUpdate);
    throttledUpdate.cancel();
  };
}, []);

// Pattern 4: Consider alternative for high-frequency data
// react-chartjs-2 (Canvas-based) or Apache ECharts for better performance
```

**Detection:**
- DevTools Performance timeline showing long tasks during chart render
- Visible lag when interacting with charts
- High CPU usage when chart is visible
- Frame rate drops below 30fps

**Phase mapping:** Likely needs deeper research in Phase 5 (Analytics Dashboard). Consider prototyping chart performance early.

**Sources:**
- [Recharts Performance Guide](https://recharts.github.io/guide/performance/)
- [Best React chart libraries (2025 update)](https://blog.logrocket.com/best-react-chart-libraries-2025/)
- [Best Chart Libraries for React Projects in 2026](https://weavelinx.com/best-chart-libraries-for-react-projects-in-2026/)

---

### Pitfall 10: Directly Modifying shadcn/ui Components Instead of Extending

**What goes wrong:** Team makes changes directly to components in `/components/ui/`. When shadcn/ui updates are needed, changes are overwritten. Can't easily update to new versions. Customizations scattered throughout codebase.

**Why it happens:** shadcn/ui's copy-paste model is unfamiliar - developers treat it like a package they can modify. No clear guidance on extension patterns. Urgency to ship leads to quick hacks.

**Consequences:**
- Lost customizations when updating components
- Can't benefit from shadcn/ui improvements and bug fixes
- Inconsistent component behavior across app
- Technical debt accumulates in UI layer

**Prevention:**
```typescript
// Anti-pattern: Modifying /components/ui/button.tsx directly
// ❌ Don't do this

// Better: Create domain-specific components that wrap shadcn/ui
// ✅ /components/session-kill-button.tsx
import { Button } from '@/components/ui/button';

export function SessionKillButton({ sessionId, onKill }) {
  return (
    <Button
      variant="destructive"
      onClick={() => onKill(sessionId)}
    >
      Kill Session
    </Button>
  );
}

// Best: Use composition for reusable patterns
// ✅ /components/confirm-button.tsx
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';

export function ConfirmButton({ children, onConfirm, description }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">{children}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

**Detection:**
- Git diff shows changes in `/components/ui/` directory
- Merge conflicts when trying to update shadcn/ui components
- Inconsistent component APIs across the app

**Phase mapping:** Establish component extension patterns in Phase 1 (Foundation).

**Sources:**
- [Shadcn UI Best Practices](https://cursorrules.org/article/shadcn-cursor-mdc-file)
- [Building a Shadcn Dashboard: What Works, What Breaks (Jan 2026)](https://medium.com/codetodeploy/building-a-shadcn-dashboard-what-works-what-breaks-and-what-to-watch-out-for-26053fb32bbd)

---

### Pitfall 11: Race Conditions in Session Kill/Control Commands

**What goes wrong:** User clicks "Kill Session" button twice quickly. Two kill commands sent. Backend processes first kill, session terminated. Second kill arrives, but session ID already gone or reused for a new session. Wrong session killed or error thrown.

**Why it happens:** No debouncing on critical actions. Frontend doesn't disable button after first click. No request ID tracking. Backend doesn't implement idempotency for control commands. Process IDs can be reused after termination.

**Consequences:**
- Duplicate actions executed
- Inconsistent state between frontend and backend
- Potential to kill wrong session if PID reused
- User confusion and lost trust in control features

**Prevention:**
```typescript
// Pattern 1: Optimistic UI with button disabling
const [killingSession, setKillingSession] = useState(null);

const handleKill = async (sessionId) => {
  if (killingSession === sessionId) return; // Already killing

  setKillingSession(sessionId);

  try {
    await killSession(sessionId);
    // Wait for WebSocket confirmation before enabling button
  } catch (error) {
    // Handle error, re-enable button
    setKillingSession(null);
  }
};

<Button
  onClick={() => handleKill(session.id)}
  disabled={killingSession === session.id}
>
  {killingSession === session.id ? 'Killing...' : 'Kill'}
</Button>

// Pattern 2: Request ID tracking with idempotency
const killSession = async (sessionId) => {
  const requestId = crypto.randomUUID();

  return fetch('/api/sessions/kill', {
    method: 'POST',
    headers: { 'X-Request-ID': requestId },
    body: JSON.stringify({ sessionId, requestId })
  });
};

// Backend implements idempotency - same requestId = same outcome
// Store recent requestIds, return success if already processed

// Pattern 3: Confirmation dialog with single submit
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Kill Session</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogDescription>
      Are you sure? This will terminate session {sessionId}.
    </AlertDialogDescription>
    <AlertDialogAction
      onClick={handleKill}
      disabled={isKilling}
    >
      {isKilling ? 'Killing...' : 'Confirm'}
    </AlertDialogAction>
  </AlertDialogContent>
</AlertDialog>
```

**Detection:**
- Open DevTools Network tab, click kill button rapidly
- Check for duplicate requests
- Test with slow network (DevTools throttling)
- Monitor backend logs for duplicate kill attempts

**Phase mapping:** Address in Phase 3 (Session Management) when implementing kill commands.

**Sources:**
- [Handling Race Conditions in Real-Time Apps](https://dev.to/mattlewandowski93/handling-race-conditions-in-real-time-apps-49c8)
- [How we found and fixed a rare race condition in our session handling](https://github.blog/security/vulnerability-research/how-we-found-and-fixed-a-rare-race-condition-in-our-session-handling/)
- [Race Condition Vulnerability](https://medium.com/@appsecwarrior/race-condition-vulnerability-e4529f35351d)

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable.

### Pitfall 12: No Route Handler Support for WebSocket Upgrade in App Router

**What goes wrong:** In Next.js Pages Router, binding WebSocket server to `res.socket.server` was straightforward. In App Router, Route Handlers don't provide the `res` object, making WebSocket integration more challenging. Developers waste time trying to force WebSocket upgrade through Route Handlers.

**Why it happens:** App Router architecture is fundamentally different from Pages Router. Route Handlers are designed for REST APIs, not protocol upgrades.

**Prevention:**
Use custom server approach that works with both Pages and App Router:

```typescript
// server.js - Custom Next.js server
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ server, path: '/api/ws' });

  wss.on('connection', (ws) => {
    // Handle WebSocket connections
  });

  server.listen(3000, () => {
    console.log('> Ready on http://localhost:3000');
  });
});

// package.json
"scripts": {
  "dev": "node server.js",
  "build": "next build",
  "start": "NODE_ENV=production node server.js"
}
```

**Detection:**
- Trying to access `res.socket` in Route Handler throws error
- WebSocket upgrade requests return 404 or error
- Documentation/examples for Pages Router don't work

**Phase mapping:** Address in Phase 1 (Foundation) - establish custom server setup before building WebSocket features.

**Sources:**
- [Enable Next.js route handlers to handle WebSocket and other Upgrade requests](https://github.com/vercel/next.js/discussions/58698)
- [Integrating Socket.IO with the App Router](https://github.com/vercel/next.js/discussions/50097)
- [Using WebSockets with Next.js on Fly.io](https://fly.io/javascript-journal/websockets-with-nextjs/)

---

### Pitfall 13: Project/Workspace Feature Creep

**What goes wrong:** Started with "project-based task organization." Now considering multi-workspace support, project templates, team collaboration, project archiving, project duplication, project import/export, project permissions, project analytics... Original timeline blown, core features still not polished.

**Why it happens:** Natural tendency to add "just one more feature" that seems useful. Lack of clearly defined scope boundaries. No change control process. 52% of all projects face scope creep (PMI 2018). 37% of project failures attributed to lack of clearly defined objectives and milestones.

**Consequences:**
- Timeline extends indefinitely
- Core features remain half-baked while edge cases get built
- Technical debt accumulates
- User confusion from too many features
- Never reaches "release-quality" because always adding more

**Prevention:**
```markdown
# Project Scope Document (Create This First!)

## MVP Scope (Phase 6: Project/Workspace Features)
- [ ] Single workspace (local, single user)
- [ ] Project creation with name + description
- [ ] Task assignment to projects
- [ ] Project filtering in task views
- [ ] Project deletion (with task reassignment)

## Explicitly OUT OF SCOPE for v1
- ❌ Multi-workspace support
- ❌ Project templates
- ❌ Team/collaboration features
- ❌ Project permissions/access control
- ❌ Project import/export
- ❌ Project archiving (just delete)
- ❌ Project-level analytics (use global analytics)

## When Tempted to Add Feature
1. Does it solve the core problem (organizing tasks)?
2. Can it wait until v2 after user feedback?
3. What's the cost/benefit ratio?

If 2/3 answers are "yes to waiting," defer it.
```

**Detection:**
- Backlog growing faster than features being completed
- PRs adding features not in original plan
- "This will only take a day" famous last words
- Original timeline no longer realistic

**Phase mapping:** Create scope document BEFORE Phase 6. Review and enforce throughout implementation.

**Sources:**
- [What Is Scope Creep and How Can I Avoid It?](https://www.projectmanager.com/blog/5-ways-to-avoid-scope-creep)
- [Understanding and Managing Scope Creep In Project Management](https://projectmanagementacademy.net/resources/blog/pmp-scope-creep/)
- [What Is "Scope" in Project Management (2026)](https://research.com/tutorials/what-is-scope-in-project-management)

---

### Pitfall 14: Not Accounting for shadcn/ui Radix Performance Issues

**What goes wrong:** Dashboard with many shadcn/ui components (Dialogs, Dropdowns, Tooltips, etc.) becomes sluggish. Radix components have known performance issues with large datasets or high-frequency updates.

**Why it happens:** shadcn/ui heavily relies on Radix UI for accessibility features and behaviors. Radix components add complexity and re-render overhead. Companies like Axiom (massive data handling) have encountered Radix-related performance issues.

**Consequences:**
- Degraded performance in data-intensive views
- Accessibility features slow down fast interactions
- May need to migrate components mid-project

**Prevention:**
```typescript
// Pattern 1: Monitor performance early with many components
// Use React DevTools Profiler to check render times

// Pattern 2: Lazy load heavy components
const HeavyDialog = lazy(() => import('@/components/heavy-dialog'));

// Pattern 3: Have migration path ready
// shadcn/ui can migrate to Base UI if Radix issues arise
// Design component API to be agnostic of underlying library

// Pattern 4: Avoid over-using heavy components
// Don't wrap every button in a Tooltip
// Don't use Dialog when a simpler Sheet would work
// Consider native HTML elements for simple cases

// Example: Lightweight confirmation instead of AlertDialog
const [showConfirm, setShowConfirm] = useState(false);

{showConfirm && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
    <div className="bg-white p-4 rounded">
      <p>Are you sure?</p>
      <button onClick={handleConfirm}>Yes</button>
      <button onClick={() => setShowConfirm(false)}>No</button>
    </div>
  </div>
)}
```

**Detection:**
- Profiling shows Radix components taking significant render time
- Interactions feel sluggish when many Radix components are mounted
- Community reports of performance issues with specific components

**Phase mapping:** Monitor throughout all UI-heavy phases. Consider lightweight alternatives for high-frequency interactions.

**Sources:**
- [Is Your Shadcn UI Project at Risk? A Deep Dive into Radix's Future](https://dev.to/mashuktamim/is-your-shadcn-ui-project-at-risk-a-deep-dive-into-radixs-future-45ei)
- [Building a Shadcn Dashboard: What Works, What Breaks (Jan 2026)](https://medium.com/codetodeploy/building-a-shadcn-dashboard-what-works-what-breaks-and-what-to-watch-out-for-26053fb32bbd)

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|---------------|------------|
| **Phase 1: Foundation** | Over-caching real-time data (Pitfall 2) | Set `dynamic = 'force-dynamic'` and `revalidate = 0` in route segment config immediately |
| **Phase 1: Foundation** | SSR/hydration mismatch (Pitfall 3) | Establish client/server boundary patterns with `'use client'` and `dynamic imports` |
| **Phase 1: Foundation** | No WebSocket upgrade support in Route Handlers (Pitfall 12) | Set up custom Next.js server from the start |
| **Phase 1: Foundation** | Modifying shadcn/ui components directly (Pitfall 10) | Create component extension guidelines and wrapper pattern |
| **Phase 2: Real-time Foundation** | WebSocket connection leaks (Pitfall 1) | Establish useEffect cleanup pattern with linting rule |
| **Phase 2: Real-time Foundation** | Missing reconnection logic (Pitfall 6) | Build reconnection with exponential backoff early |
| **Phase 2: Real-time Foundation** | State sync issues across tabs (Pitfall 5) | Implement BroadcastChannel or single-tab enforcement |
| **Phase 2: Real-time Foundation** | Massive re-renders from WebSocket (Pitfall 4) | Design fine-grained state management architecture |
| **Phase 3: Session Management** | Race conditions in kill commands (Pitfall 11) | Implement request ID tracking and optimistic UI |
| **Phase 4: Chat Interface** | Auto-scroll fighting user (Pitfall 7) | Implement scroll position detection early |
| **Phase 4: Chat Interface** | Testing WebSocket features (Pitfall 8) | Set up jest-websocket-mock from beginning |
| **Phase 5: Analytics Dashboard** | Recharts performance ceiling (Pitfall 9) | Prototype with real data volume, consider alternatives |
| **Phase 5: Analytics Dashboard** | Chart re-rendering on every update (Pitfall 4 + 9) | Throttle updates, memoize chart components |
| **Phase 6: Project Features** | Feature creep (Pitfall 13) | Define MVP scope document before implementation |
| **All Phases** | shadcn/ui Radix performance (Pitfall 14) | Monitor performance, have lightweight alternatives ready |

---

## Research Confidence Assessment

| Pitfall Category | Confidence | Notes |
|------------------|-----------|-------|
| WebSocket memory leaks | HIGH | Multiple sources from Jan 2026, consistent patterns |
| Next.js 15 caching | HIGH | Official docs + recent community articles |
| SSR/hydration issues | HIGH | Official Next.js docs + practical examples |
| React re-render performance | HIGH | Recent case studies with specific metrics |
| WebSocket state sync | MEDIUM | Architecture patterns verified, but implementation details sparse |
| Reconnection logic | HIGH | Recent 2026 article + established patterns |
| Chat scroll behavior | MEDIUM | Multiple GitHub issues + blog posts, but no official guidance |
| WebSocket testing | HIGH | Established libraries with good documentation |
| Recharts performance | HIGH | Official performance guide + recent comparisons |
| shadcn/ui anti-patterns | HIGH | Best practices docs + recent experience reports |
| Race conditions | MEDIUM | General patterns verified, session-specific details inferred |
| App Router WebSocket | HIGH | Official GitHub discussions confirming limitations |
| Scope creep | LOW | General project management, not domain-specific |
| Radix performance | MEDIUM | Community reports but limited hard data |

---

## Summary: What Makes Real-Time Dashboards Fail

**The #1 killer:** Memory leaks from improper WebSocket cleanup. Silent, accumulating, eventually catastrophic.

**The #2 killer:** Over-caching stale data. Users see wrong information, lose trust in real-time features.

**The #3 killer:** Massive re-renders. Dashboard feels sluggish despite fast backend and network.

**The sleeper issue:** Missing reconnection logic. Everything works until it doesn't, and users don't know why.

**The project management pitfall:** Feature creep in project/workspace organization. Started simple, now building Jira.

**The testing gap:** WebSocket features untested because "it's hard." Production bugs in critical flows.

**Avoiding OpenClaw Control UI mistakes:**
- **"Ugly"** → Use shadcn/ui properly (don't modify, extend)
- **"Slow"** → Prevent re-render storms with proper state management
- **"Missing features"** → But don't over-compensate with scope creep

Build the foundation right (Phase 1-2) and the features will be easier (Phase 3-6).
