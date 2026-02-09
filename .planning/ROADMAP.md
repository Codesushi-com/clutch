# Roadmap: OpenClutch

## Overview

OpenClutch is a WebSocket-driven real-time dashboard for OpenClaw AI agents. The roadmap starts with foundation-first architecture (WebSocket lifecycle, state management, Next.js caching config) to prevent critical pitfalls, then builds core monitoring features (sessions, cron, analytics, chat), and finishes with differentiating features (task management, project organization) that tie everything together. Each phase delivers observable user capabilities backed by comprehensive infrastructure.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & WebSocket Infrastructure** - Establish WebSocket connection lifecycle and Next.js caching patterns
- [ ] **Phase 2: RPC Client & State Management** - Build type-safe API client and event-driven state architecture
- [ ] **Phase 3: Session Management** - Real-time session monitoring with kill/cancel capabilities
- [ ] **Phase 4: Cron Management** - Monitor and control cron jobs with execution history
- [ ] **Phase 5: Analytics Dashboard** - Token usage and cost tracking with visualizations
- [ ] **Phase 6: Chat Interface** - Streaming chat with markdown rendering and syntax highlighting
- [ ] **Phase 7: Task Management** - Bidirectional task system with kanban board and CLI integration
- [ ] **Phase 8: Project Organization** - Group sessions, crons, tasks, and chats by project
- [ ] **Phase 9: UI Polish** - Consistent design system, dark mode, and real-time updates
- [ ] **Phase 10: Infrastructure** - CI/CD pipeline, pre-commit hooks, and test coverage

## Phase Details

### Phase 1: Foundation & WebSocket Infrastructure
**Goal**: Establish reliable WebSocket connection to OpenClaw gateway with proper lifecycle management
**Depends on**: Nothing (first phase)
**Requirements**: None (foundation for all other requirements)
**Success Criteria** (what must be TRUE):
  1. Dashboard connects to OpenClaw WebSocket API on page load
  2. Connection automatically reconnects after network interruption with exponential backoff
  3. Connection status indicator shows current state (connected/disconnected/reconnecting)
  4. Dashboard pages do not show stale cached data when WebSocket provides fresh updates
  5. Memory usage remains stable during extended sessions (no WebSocket cleanup leaks)
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD

### Phase 2: RPC Client & State Management
**Goal**: Build type-safe RPC client and event-driven state management architecture
**Depends on**: Phase 1
**Requirements**: UI-04 (real-time updates without manual refresh)
**Success Criteria** (what must be TRUE):
  1. Dashboard can call any OpenClaw gateway method with full type safety
  2. Components receive real-time event updates from OpenClaw gateway
  3. UI updates automatically when WebSocket events arrive without page refresh
  4. Multiple browser tabs stay synchronized with same OpenClaw state
  5. UI remains responsive when high-frequency events arrive (no re-render storms)
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Session Management
**Goal**: User can monitor and control all OpenClaw sessions in real-time
**Depends on**: Phase 2
**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04
**Success Criteria** (what must be TRUE):
  1. User can view list of all active sessions showing model, status, and current token counts
  2. User can kill any running session and see it disappear from the list immediately
  3. User can click into a session to view its full transcript and history
  4. User can filter session list by model, status, or time range to find specific sessions
  5. Session list updates in real-time when new sessions start or existing ones complete
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: Cron Management
**Goal**: User can monitor and control OpenClaw cron jobs with full execution history
**Depends on**: Phase 2
**Requirements**: CRON-01, CRON-02, CRON-03, CRON-04, CRON-05
**Success Criteria** (what must be TRUE):
  1. User can view list of all cron jobs with schedule, status, and next run time
  2. User can manually trigger any cron job and see it execute immediately
  3. User can pause or resume individual cron jobs by toggling enable/disable
  4. User can view execution history for any cron job showing status, duration, and errors
  5. User can tag cron jobs with project associations visible in the cron list
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Analytics Dashboard
**Goal**: User can analyze token usage and costs across models and time periods
**Depends on**: Phase 2
**Requirements**: ANLY-01, ANLY-02, ANLY-03, ANLY-04
**Success Criteria** (what must be TRUE):
  1. User can view token usage breakdown by model showing input and output tokens separately
  2. User can view cost trends over time with daily, weekly, or monthly granularity
  3. User can see per-session cost displayed inline in the session list
  4. User can view model usage distribution chart showing which models are used most
  5. Charts remain performant and readable with realistic data volumes (100+ data points)
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

### Phase 6: Chat Interface
**Goal**: User can chat with OpenClaw with streaming responses and rich formatting
**Depends on**: Phase 2
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04
**Success Criteria** (what must be TRUE):
  1. User can send message and receive streaming response that appears token-by-token
  2. User can abort a running response mid-stream and send a new message
  3. User can scroll through previous chat history loaded from OpenClaw
  4. Chat renders markdown formatting with syntax-highlighted code blocks
  5. User can copy code from chat messages with one-click copy buttons
**Plans**: TBD

Plans:
- [ ] 06-01: TBD

### Phase 7: Task Management
**Goal**: User and OpenClaw agents can both create and manage tasks with CLI integration
**Depends on**: Phase 2
**Requirements**: TASK-01, TASK-02, TASK-03, TASK-04, TASK-05
**Success Criteria** (what must be TRUE):
  1. User can create, edit, and delete tasks with title, description, priority, and status
  2. User can organize tasks in kanban board and drag-and-drop between columns
  3. User can add notes and comments to individual tasks and view comment history
  4. OpenClaw agents can create or update tasks programmatically during execution
  5. CLI tool exists that scripts can use to create and query tasks from command line
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD

### Phase 8: Project Organization
**Goal**: User can organize all work (sessions, crons, tasks, chats) by project context
**Depends on**: Phases 3, 4, 6, 7
**Requirements**: PROJ-01, PROJ-02, PROJ-03, PROJ-04, PROJ-05
**Success Criteria** (what must be TRUE):
  1. User can create projects with name, description, and directory path
  2. Each project has a directory path that clearly identifies the git repo or codebase
  3. User can filter all views (sessions, crons, tasks, chats) by selecting active project
  4. User can tag sessions, crons, tasks, and chats as belonging to specific projects
  5. User can view project dashboard showing all tasks, crons, and recent chats for that project
**Plans**: TBD

Plans:
- [ ] 08-01: TBD

### Phase 9: UI Polish
**Goal**: Dashboard has consistent, professional design with dark mode support
**Depends on**: Phases 3, 4, 5, 6
**Requirements**: UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. All dashboard screens use shadcn/ui components with consistent styling
  2. Dashboard has polished, professional visual design with clear hierarchy and spacing
  3. User can toggle dark mode and all components render correctly in both themes
  4. Dashboard feels cohesive with unified navigation, headers, and layout patterns
**Plans**: TBD

Plans:
- [ ] 09-01: TBD

### Phase 10: Infrastructure
**Goal**: Production-quality development workflow with automated quality checks
**Depends on**: Phases 3, 4, 5, 6
**Requirements**: INFR-01, INFR-02, INFR-03
**Success Criteria** (what must be TRUE):
  1. CI pipeline runs on every push and fails if lint, type-check, test, or build fail
  2. Pre-commit hooks prevent commits with lint or type-check errors
  3. Core functionality has unit and component test coverage with passing tests
  4. New contributors can run tests locally and see same results as CI
**Plans**: TBD

Plans:
- [ ] 10-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & WebSocket Infrastructure | 0/TBD | Not started | - |
| 2. RPC Client & State Management | 0/TBD | Not started | - |
| 3. Session Management | 0/TBD | Not started | - |
| 4. Cron Management | 0/TBD | Not started | - |
| 5. Analytics Dashboard | 0/TBD | Not started | - |
| 6. Chat Interface | 0/TBD | Not started | - |
| 7. Task Management | 0/TBD | Not started | - |
| 8. Project Organization | 0/TBD | Not started | - |
| 9. UI Polish | 0/TBD | Not started | - |
| 10. Infrastructure | 0/TBD | Not started | - |
