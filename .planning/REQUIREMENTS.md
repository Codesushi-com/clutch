# Requirements: OpenClutch

**Defined:** 2026-02-02
**Core Value:** See what OpenClaw is doing, kill what needs killing, and keep work organized — without juggling Discord, the built-in UI, and spreadsheets.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Session Management

- [ ] **SESS-01**: User can view real-time list of all sessions with model, status, and token counts
- [ ] **SESS-02**: User can kill/cancel any running session or sub-agent
- [ ] **SESS-03**: User can drill into a session to view transcript/history
- [ ] **SESS-04**: User can filter sessions by model, status, and time range

### Analytics

- [ ] **ANLY-01**: User can view token usage breakdown by model (input/output)
- [ ] **ANLY-02**: User can view cost trends over time (daily/weekly/monthly)
- [ ] **ANLY-03**: User can see per-session cost in the session list
- [ ] **ANLY-04**: User can view model usage distribution (which models are being used)

### Cron Management

- [ ] **CRON-01**: User can view list of all cron jobs with status, schedule, last/next run
- [ ] **CRON-02**: User can manually trigger any cron job
- [ ] **CRON-03**: User can pause/resume (enable/disable) individual cron jobs
- [ ] **CRON-04**: User can view run history with status, duration, and errors
- [ ] **CRON-05**: User can associate cron jobs with projects (via tagging or metadata)

### Chat

- [ ] **CHAT-01**: User can send messages and receive streaming responses
- [ ] **CHAT-02**: User can abort a running response mid-stream
- [ ] **CHAT-03**: User can load previous chat history
- [ ] **CHAT-04**: Chat renders markdown with code syntax highlighting

### Task Management

- [ ] **TASK-01**: User can create, edit, and delete tasks with title, description, priority, status
- [ ] **TASK-02**: User can organize tasks in kanban board (drag-and-drop columns)
- [ ] **TASK-03**: User can add notes/comments to individual tasks
- [ ] **TASK-04**: OpenClaw agents can create/update tasks programmatically
- [ ] **TASK-05**: CLI tool exists for scripts to interact with tasks

### Project Organization

- [ ] **PROJ-01**: User can create, edit, and delete projects with name, description, and directory path
- [ ] **PROJ-02**: Projects have a directory path as a fundamental property (usually a git repo)
- [ ] **PROJ-03**: User can filter sessions, crons, tasks, and chats by active project
- [ ] **PROJ-04**: User can tag chats, crons, and tasks as belonging to a project
- [ ] **PROJ-05**: User can view project dashboard showing its tasks, crons, and recent chats

### UI/UX

- [ ] **UI-01**: Dashboard uses shadcn/ui components consistently
- [ ] **UI-02**: Dashboard has polished, professional visual design
- [ ] **UI-03**: Dashboard supports dark mode
- [ ] **UI-04**: Real-time updates reflect without manual refresh

### Infrastructure

- [ ] **INFR-01**: CI pipeline runs lint, type-check, test, build on every push
- [ ] **INFR-02**: Pre-commit hooks enforce lint and type-check before commits
- [ ] **INFR-03**: Unit and component tests exist for core functionality

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Rich Chat Widgets

- **WIDG-01**: Chat can render tables inline (from structured data)
- **WIDG-02**: Chat can render charts inline (token usage, etc.)
- **WIDG-03**: Chat supports interactive action buttons (Approve, Reject, Run)
- **WIDG-04**: Chat supports collapsible code blocks for long output

### Advanced Session Features

- **SESS-05**: User can replay a session with same inputs for debugging
- **SESS-06**: User can rewind a session to an earlier point
- **SESS-07**: Session recovery from failure point (checkpointing)

### E2E Testing

- **TEST-01**: Playwright E2E tests cover critical user flows

### Advanced Analytics

- **ANLY-05**: AI-powered insights on usage patterns
- **ANLY-06**: Cost optimization suggestions

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-user authentication | Single-user app, no login needed |
| Native mobile app | Web-first, evaluate native later for voice features |
| 2-way voice | Future feature, evaluate web vs native when needed |
| Tailscale/remote access setup | Infrastructure concern, not app code |
| Custom widget plugin system | Over-engineering for v1, build specific widgets first |
| Distributed tracing (OpenTelemetry) | Single-machine app, overkill |
| Team collaboration features | Not a team tool, stay single-user |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SESS-01 | Phase 3 | Pending |
| SESS-02 | Phase 3 | Pending |
| SESS-03 | Phase 3 | Pending |
| SESS-04 | Phase 3 | Pending |
| ANLY-01 | Phase 5 | Pending |
| ANLY-02 | Phase 5 | Pending |
| ANLY-03 | Phase 5 | Pending |
| ANLY-04 | Phase 5 | Pending |
| CRON-01 | Phase 4 | Pending |
| CRON-02 | Phase 4 | Pending |
| CRON-03 | Phase 4 | Pending |
| CRON-04 | Phase 4 | Pending |
| CRON-05 | Phase 4 | Pending |
| CHAT-01 | Phase 6 | Pending |
| CHAT-02 | Phase 6 | Pending |
| CHAT-03 | Phase 6 | Pending |
| CHAT-04 | Phase 6 | Pending |
| TASK-01 | Phase 7 | Pending |
| TASK-02 | Phase 7 | Pending |
| TASK-03 | Phase 7 | Pending |
| TASK-04 | Phase 7 | Pending |
| TASK-05 | Phase 7 | Pending |
| PROJ-01 | Phase 8 | Pending |
| PROJ-02 | Phase 8 | Pending |
| PROJ-03 | Phase 8 | Pending |
| PROJ-04 | Phase 8 | Pending |
| PROJ-05 | Phase 8 | Pending |
| UI-01 | Phase 9 | Pending |
| UI-02 | Phase 9 | Pending |
| UI-03 | Phase 9 | Pending |
| UI-04 | Phase 2 | Pending |
| INFR-01 | Phase 10 | Pending |
| INFR-02 | Phase 10 | Pending |
| INFR-03 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0

---
*Requirements defined: 2026-02-02*
*Last updated: 2026-02-02 after roadmap creation*
