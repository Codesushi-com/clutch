# AGENTS.md - OpenClutch Workspace

## Production Server
- **Running on port 3002 via systemd** (`clutch-server.service`) — do NOT start another
- Uses `next start` (production build), NOT `pnpm dev`
- Check status: `systemctl --user status clutch-server` or `curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/`
- If dead: `systemctl --user restart clutch-server`
- After merging changes to `main`: rebuild and restart with `cd /home/dan/src/clutch && pnpm build && systemctl --user restart clutch-server`

## Commands
- `pnpm build` — production build (required after code changes on main)
- `pnpm lint` — eslint
- `pnpm typecheck` — tsc

## Task Management (clutch CLI)
```bash
# Update ticket status
clutch tasks move TICKET_ID in_review

# Get task details
clutch tasks get TICKET_ID
clutch tasks get TICKET_ID --json

# List tasks
clutch tasks list --project clutch --status ready

# Check active agents
clutch agents list

# Check pending signals
clutch signals list --pending
```
Statuses: `backlog` → `ready` → `in_progress` → `in_review` → `done` (+ `blocked`)

## Rules
- Pre-commit hooks must pass — no `--no-verify`
- Don't merge your own PRs
- Don't kill port 3002
- Use `pnpm`, not `npm`

## Tool Usage

**`read` tool — ALWAYS pass a `path` parameter:**
```
read(path="/path/to/clutch/some/file.ts")
```
Never call `read()` with no arguments — it will fail. If you need to explore the project structure, use `exec` with `fd`, `rg`, or `cat` instead.

**Prefer `exec` for file exploration.** Use `read` only when you already have a specific file path.

**Common patterns:**
```bash
# Find files by name (fd is available)
fd "\.tsx$" /path/to/clutch/app

# Search for code (rg is available — use it instead of grep)
# NOTE: -t ts covers .ts AND .tsx. Do NOT use -t tsx (doesn't exist)
rg "functionName" /path/to/clutch/app -t ts

# Read a file
cat /path/to/clutch/app/page.tsx

# IMPORTANT: Quote paths with brackets (Next.js [slug] dirs)
cat '/path/to/clutch/app/projects/[slug]/page.tsx'

# List directory
ls /path/to/clutch/app/
```

## Git Worktrees (REQUIRED)

**NEVER switch branches in `/path/to/clutch`** — the dev server runs there on `main`.

**For ALL feature work:**
```bash
# Create worktree for your task
cd /path/to/clutch
git worktree add /path/to/clutch-worktrees/<branch-name> -b <branch-name>

# Work in the worktree
cd /path/to/clutch-worktrees/<branch-name>

# When done (after PR merged), clean up
git worktree remove /path/to/clutch-worktrees/<branch-name>
```

Branch naming: `fix/<ticket-id-prefix>-<short-desc>` or `feat/<ticket-id-prefix>-<short-desc>`

**Why:** Switching branches in the main repo breaks the production build and disrupts the running server.

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

## Task Description Formatting

Task descriptions may contain special characters including:
- Backticks for inline code: `fix/branch-name`
- Special chars: `$`, `"`, `'`, `\`, `|`, `&`, `;`
- Command examples with variables: `PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$')`

These are preserved in task specifications and should be handled correctly by agents.