# AGENTS.md - Trap Workspace

## Dev Server
- **Running on port 3002** — do NOT start another
- Turbopack hot-reloads on save
- Check status: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/`
- If dead: `rm -f .next/dev/lock && PORT=3002 nohup pnpm dev > /tmp/trap-next.log 2>&1 &`

## Commands
- `pnpm build` — production build
- `pnpm lint` — eslint
- `pnpm typecheck` — tsc

## Task API
```bash
# Update ticket status
curl -X PATCH http://localhost:3002/api/tasks/TICKET_ID \
  -H 'Content-Type: application/json' -d '{"status": "in_review"}'
```
Statuses: `backlog` → `ready` → `in_progress` → `in_review` → `done`

## Rules
- Pre-commit hooks must pass — no `--no-verify`
- Don't merge your own PRs
- Don't kill port 3002
- Use `pnpm`, not `npm`

## Tool Usage

**`read` tool — ALWAYS pass a `path` parameter:**
```
read(path="/home/dan/src/openclutch/some/file.ts")
```
Never call `read()` with no arguments — it will fail. If you need to explore the project structure, use `exec` with `fd`, `rg`, or `cat` instead.

**Prefer `exec` for file exploration.** Use `read` only when you already have a specific file path.

**Common patterns:**
```bash
# Find files by name (fd is available)
fd "\.tsx$" /home/dan/src/openclutch/app

# Search for code (rg is available — use it instead of grep)
# NOTE: -t ts covers .ts AND .tsx. Do NOT use -t tsx (doesn't exist)
rg "functionName" /home/dan/src/openclutch/app -t ts

# Read a file
cat /home/dan/src/openclutch/app/page.tsx

# IMPORTANT: Quote paths with brackets (Next.js [slug] dirs)
cat '/home/dan/src/openclutch/app/projects/[slug]/page.tsx'

# List directory
ls /home/dan/src/openclutch/app/
```

## Git Worktrees (REQUIRED)

**NEVER switch branches in `/home/dan/src/openclutch`** — the dev server runs there on `main`.

**For ALL feature work:**
```bash
# Create worktree for your task
cd /home/dan/src/openclutch
git worktree add /home/dan/src/openclutch-worktrees/<branch-name> -b <branch-name>

# Work in the worktree
cd /home/dan/src/openclutch-worktrees/<branch-name>

# When done (after PR merged), clean up
git worktree remove /home/dan/src/openclutch-worktrees/<branch-name>
```

Branch naming: `fix/<ticket-id-prefix>-<short-desc>` or `feat/<ticket-id-prefix>-<short-desc>`

**Why:** Switching branches in the main repo kills the running dev server, breaking the app for users.

---

## Observatory Architecture

**Observatory** is the centralized dashboard that replaced the old work-loop page. It provides a tabbed interface for monitoring and controlling AI agents across projects.

### Routes
- **Global Observatory:** `/work-loop` → `components/observatory/observatory-shell.tsx`
- **Per-Project Observatory:** `/projects/[slug]/work-loop` → locked to single project via `lockedProjectId`

### Tab Structure
The Observatory shell contains 5 tabs managed by the shared filter system:

1. **Live** (`components/observatory/live/`) - Real-time work-loop monitoring
   - `live-tab.tsx` - Main live dashboard
   - `stats-panel.tsx` - Work-loop statistics and metrics
   - `activity-log.tsx` - Recent agent actions and events
   - `active-agents.tsx` - Currently running agents
   - `status-badge.tsx` - Work-loop status indicator

2. **Triage** (`components/observatory/triage/`) - Blocked task management
   - `triage-tab.tsx` - Blocked task review interface
   - `blocked-task-card.tsx` - Individual blocked task display
   - `triage-metrics.tsx` - Triage performance metrics

3. **Analytics** (`components/observatory/analytics/`) - Historical performance data
   - `analytics-tab.tsx` - Main analytics dashboard
   - `cost-chart.tsx` - Cost tracking visualization
   - `performance-chart.tsx` - Agent performance metrics

4. **Models** (`components/observatory/models/`) - Model usage and performance
   - `models-tab.tsx` - Model comparison and usage stats
   - `model-usage-chart.tsx` - Model usage over time

5. **Prompts** (`components/observatory/prompts/`) - Prompt performance analysis (migrated from `/prompts/metrics`)
   - `prompts-tab.tsx` - Prompt performance dashboard
   - `prompt-comparison.tsx` - A/B testing results
   - `types.ts` - Prompt metrics types

### Shared Components
- `observatory-shell.tsx` - Main shell with tab navigation
- `observatory-tab.tsx` - Individual tab container
- `project-filter.tsx` - Project selection (disabled when `lockedProjectId` set)
- `time-range-toggle.tsx` - Time range picker for analytics

### Navigation Integration
- **Sidebar:** Shows "Observatory" label, links to `/work-loop`
- **Mobile:** Shows "Loop" label for space, same link
- **Project Layout:** "Work Loop" tab links to per-project Observatory
- **Work Loop Status:** `WorkLoopHeaderStatus` component shows in project headers

### Backend APIs
- All existing `/api/prompts/metrics/*` endpoints preserved for Observatory
- Work-loop state managed via Convex `workLoop.ts` queries/mutations
- Agent tracking via existing task and session APIs

---

## Ticket Verification

**Before marking a ticket as `in_review`:**
1. TypeScript compiles (`pnpm typecheck`)
2. Lint passes (`pnpm lint`)
3. Code review — does the implementation match the ticket?

**If the ticket involves UI changes:**
- Note "needs browser QA" in your PR description
- Leave the ticket in `in_review` — QA agents will verify visually

## Browser Testing (QA role only)

⚠️ **Only QA agents should use browser automation.** Dev and reviewer agents should NOT use browser tools.

QA agents have access to `agent-browser` (CLI). See the QA role prompt for full usage. Key points:
- App runs at `http://localhost:3002`
- Use `agent-browser open`, `snapshot`, `click`, `fill`, `screenshot`, `close`
- **Always run `agent-browser close` when done** — failing to do so leaks memory