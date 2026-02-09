# OpenClutch

AI agent orchestration system where Ada serves as coordinator for specialized sub-agents.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Run production server
PORT=3002 pnpm start
```

**Dev URL:** http://192.168.7.200:3002  
**Prod URL:** https://ada.codesushi.com

## Architecture

### Core Concept
- **Ada (Coordinator)** - Main agent that triages and delegates to sub-agents
- **Worker Agents** - Stateless, fresh session per task (kimi-coder, sonnet-reviewer, haiku-triage)
- **OpenClutch Board** - Convex-backed task management (replaces GitHub Projects)
- **Observatory** - 5-tab dashboard for monitoring and controlling AI agents
- **Chat** - Bidirectional communication with OpenClaw main session

### Tech Stack
- Next.js 16, TypeScript, React 19
- Convex (self-hosted) for real-time data
- Tailwind CSS v4 + shadcn/ui
- Zustand for state management
- Vitest for testing
- pnpm for package management

### Process Architecture

OpenClutch runs as **4 separate processes** managed by `run.sh`:

1. **Next.js Server** (`trap-server`) - Serves web UI and API routes (port 3002)
2. **Work Loop** (`trap-loop`) - Agent orchestration, task scheduling, triage
3. **Chat Bridge** (`trap-bridge`) - WebSocket client syncing OpenClaw ↔ Convex
4. **Session Watcher** (`trap-session-watcher`) - Reads OpenClaw JSONL files, upserts to Convex `sessions` table

**Why split:** Running work loop + WebSocket client in Next.js blocked the event loop, causing 30s+ page loads.

**Management:**
```bash
./run.sh start      # Build + enable/start all systemd services
./run.sh stop       # Stop all services
./run.sh restart    # Stop + start
./run.sh status     # Show systemd service status
./run.sh logs       # Tail server logs (journald)
./run.sh loop-logs  # Tail work loop logs
./run.sh bridge-logs # Tail chat bridge logs
./run.sh watcher-logs # Tail session watcher logs
./run.sh all-logs   # Tail all logs
```

## Observatory

The **Observatory** is the centralized dashboard that replaced the old work-loop page. It provides a tabbed interface for monitoring and controlling AI agents across projects.

### Routes
- **Global Observatory:** `/work-loop` - All projects
- **Per-Project Observatory:** `/projects/[slug]/work-loop` - Locked to single project

### Tabs

1. **Live** - Real-time work-loop monitoring
   - Active agents and their status
   - Work-loop statistics and metrics
   - Recent agent actions and events

2. **Triage** - Blocked task management
   - Review and unblock stuck tasks
   - Triage performance metrics

3. **Analytics** - Historical performance data
   - Cost tracking and visualizations
   - Agent performance metrics over time

4. **Models** - Model usage and performance
   - Model comparison and usage stats
   - Cost per model

5. **Prompts** - Prompt performance analysis
   - A/B testing results
   - Prompt version performance

## Work Loop v2

The work loop is OpenClutch's agent orchestration engine. It runs continuously, cycling through phases to manage agent execution across all projects.

### Phases

1. **Cleanup** - Close stale browser tabs, reset transient state
2. **Triage** - Identify blocked tasks and notify Ada
3. **Review** - Check completed work, spawn reviewers for PRs
4. **Work** - Spawn agents for ready tasks

### Agent Roles

| Role | Model | Purpose |
|------|-------|---------|
| `dev` | kimi-for-coding | Implement features, fix bugs |
| `reviewer` | kimi-for-coding | Review PRs, request changes or merge |
| `pm` | sonnet | Research, plan, write specs |
| `research` | sonnet | Deep investigation, analysis |
| `conflict_resolver` | kimi-for-coding | Auto-rebase and resolve merge conflicts |

### Status Flow

```
backlog → ready → in_progress → in_review → done
              ↓        ↓
           blocked ←─┘
```

- **backlog** - Holding pen for future work
- **ready** - Available for agents to pick up
- **in_progress** - Agent actively working
- **in_review** - PR opened, waiting for review
- **blocked** - Stuck, needs triage
- **done** - Completed

### Triage System

When tasks become blocked, the work loop:
1. Detects blocking conditions (signals, failed agents, conflicts)
2. Sends batched triage messages to Ada via HTTP
3. Ada reviews and decides: unblock, reassign, split, or escalate
4. Circuit breaker: auto-escalates to Dan after 3 triage attempts

### Agent Limits

Configured via environment variables:

```bash
WORK_LOOP_MAX_AGENTS=4              # Global max concurrent agents
WORK_LOOP_MAX_AGENTS_PER_PROJECT=3  # Per-project limit
WORK_LOOP_MAX_DEV_AGENTS=2          # Max dev agents
WORK_LOOP_MAX_REVIEWER_AGENTS=2     # Max reviewer agents
```

### Concurrency Tuning (Critical)

OpenClutch's agent limits must match OpenClaw's command lane concurrency:

**In `~/.openclaw/openclaw.json`:**
```json
{
  "agents": {
    "defaults": {
      "maxConcurrent": 8
    }
  }
}
```

If OpenClaw's limit is lower than OpenClutch's, agents will queue and may be falsely reaped ("ghost-completing" with 0 tokens).

**OpenClutch reaper grace period:** Located in `worker/agent-manager.ts`. Recommended: **10 minutes** when running high parallelism.

### Multi-Project Support

The work loop runs for all projects with `work_loop_enabled=1`. Each project needs:
- `local_path` - Where to create worktrees
- `github_repo` - For PR operations

Worktree convention: `{project.local_path}-worktrees/fix/{taskId.slice(0,8)}`

## Database

OpenClutch uses **Convex** (self-hosted) for real-time data synchronization.

### Tables

**Core:**
- `projects` - Project metadata, repo links, work loop config
- `tasks` - Kanban tasks with status, priority, assignee, agent tracking
- `comments` - Task comments for agent communication
- `chats` - Chat threads per project
- `chatMessages` - Chat message history

**Work Loop:**
- `workLoopRuns` - Audit log of every loop action
- `workLoopState` - Current state of each project's loop
- `task_events` - Detailed audit trail for task transitions
- `sessions` - Unified tracking for all OpenClaw sessions

**Agent System:**
- `signals` - Agent signals (questions, blockers, alerts)
- `taskDependencies` - Task dependency graph
- `promptVersions` - Versioned role prompt templates
- `taskAnalyses` - Post-mortem analysis of completed tasks
- `promptMetrics` - Aggregated performance per role/model/version

**Observatory:**
- `model_pricing` - Cost per 1M tokens for each model
- `notifications` - System notifications
- `events` - Activity log

**Feature Builder:**
- `features` - High-level feature/epic definitions
- `requirements` - Individual requirements
- `roadmapPhases` - GSD-style phase definitions
- `phaseRequirements` - Phase-to-requirement mappings
- `featureBuilderSessions` - Feature builder usage tracking
- `featureBuilderAnalytics` - Aggregated metrics

### Convex Setup

Convex runs locally via Docker:
```bash
# Start Convex (if not already running)
docker start convex-local  # or check docker-compose

# Deploy schema changes
npx convex deploy --url http://127.0.0.1:3210 --admin-key '<admin-key>'
```

The Convex URL is configured via `NEXT_PUBLIC_CONVEX_URL` (defaults to `http://127.0.0.1:3210`).

## OpenClaw Integration

### WebSocket Chat

OpenClutch connects to OpenClaw via WebSocket for real-time chat.

```javascript
// Connect handshake (first message required)
{
  type: "req",
  id: "<uuid>",
  method: "connect",
  params: {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: "webchat",
      version: "1.0.0", 
      platform: "web",
      mode: "webchat"
    },
    auth: { token: "<OPENCLAW_TOKEN>" }
  }
}
```

### Channel Plugin

The clutch-channel plugin enables bidirectional messaging:
- Plugin location: `plugins/clutch-channel.ts`
- Symlink to: `~/.openclaw/extensions/clutch-channel.ts`

### Session Tracking

The **session watcher** worker (`worker/session-watcher.ts`) is the only code that reads OpenClaw JSONL session files. It batches/upserts into Convex `sessions` table; everything else reads from Convex. This allows swapping storage later without touching loop/UI.

Agent completion is detected via `stopReason: "stop"` in JSONL files.

## Environment Variables

Create `.env.local`:

```bash
# OpenClaw API (server-side)
OPENCLAW_HTTP_URL=http://127.0.0.1:18789
OPENCLAW_WS_URL=ws://127.0.0.1:18789/ws
OPENCLAW_TOKEN=<your-gateway-token>
OPENCLAW_HOOKS_URL=http://localhost:18789/hooks
OPENCLAW_HOOKS_TOKEN=<your-hooks-token>

# OpenClaw (client-side)
NEXT_PUBLIC_OPENCLAW_API_URL=http://192.168.7.200:18789
NEXT_PUBLIC_OPENCLAW_WS_URL=ws://192.168.7.200:18789/ws
NEXT_PUBLIC_OPENCLAW_TOKEN=<your-gateway-token>

# Convex
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=<admin-key>
CONVEX_URL=http://127.0.0.1:3210
NEXT_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211

# Work Loop
WORK_LOOP_ENABLED=true
WORK_LOOP_MAX_AGENTS=4
WORK_LOOP_MAX_AGENTS_PER_PROJECT=3
WORK_LOOP_MAX_DEV_AGENTS=2
WORK_LOOP_MAX_REVIEWER_AGENTS=2

# Server
PORT=3002
```

## Project Structure

```
trap/
├── app/                          # Next.js app router
│   ├── api/                      # API routes
│   │   ├── chats/                # Chat CRUD
│   │   ├── tasks/                # Task CRUD
│   │   ├── projects/             # Project CRUD
│   │   ├── signal/               # Agent signal API
│   │   ├── triage/               # Triage endpoints
│   │   ├── prompts/metrics/      # Prompt metrics API
│   │   └── work-loop/config      # Dynamic work loop config
│   ├── projects/[slug]/          # Project pages (board, chat, work-loop)
│   ├── work-loop/                # Global Observatory
│   ├── prompts/                  # Prompt management
│   ├── agents/                   # Agent status page
│   ├── sessions/                 # Session list
│   └── settings/                 # Settings page
├── components/                   # React components
│   ├── board/                    # Kanban board components
│   ├── chat/                     # Chat UI components
│   ├── observatory/              # Observatory dashboard
│   │   ├── live/                 # Live tab components
│   │   ├── triage/               # Triage tab components
│   │   ├── analytics/            # Analytics tab components
│   │   ├── models/               # Models tab components
│   │   └── prompts/              # Prompts tab components
│   ├── providers/                # Context providers
│   └── ui/                       # shadcn/ui components
├── lib/                          # Library code
│   ├── api/                      # API utilities
│   ├── convex/                   # Convex queries/mutations
│   ├── hooks/                    # React hooks
│   ├── stores/                   # Zustand stores
│   ├── types/                    # TypeScript types
│   └── utils/                    # Utility functions
├── worker/                       # Background workers
│   ├── loop.ts                   # Main work loop
│   ├── agent-manager.ts          # Agent lifecycle management
│   ├── session-watcher.ts        # Session file monitoring
│   ├── chat-bridge.ts            # OpenClaw WS bridge
│   ├── gateway-client.ts         # OpenClaw RPC client
│   ├── session-file-reader.ts    # JSONL file parsing
│   ├── decide.ts                 # Loop decision logic
│   ├── prompts.ts                # Prompt fetching
│   └── phases/                   # Work loop phases
│       ├── cleanup.ts
│       ├── triage.ts
│       ├── review.ts
│       └── work.ts
├── convex/                       # Convex schema and functions
│   ├── schema.ts                 # Database schema
│   ├── tasks.ts                  # Task mutations/queries
│   ├── workLoop.ts               # Work loop state
│   ├── sessions.ts               # Session tracking
│   ├── task_events.ts            # Event logging
│   └── ...
├── plugins/                      # OpenClaw plugins
│   ├── trap-channel.ts           # Channel plugin for chat
│   └── trap-signal.ts            # Signal plugin for notifications
├── bin/                          # CLI tools
│   └── trap-cli.ts               # OpenClutch CLI
├── scripts/                      # Utility scripts
├── systemd/                      # Systemd service files
├── run.sh                        # Process management script
└── roles/                        # Agent role prompts (external)
```

**Note:** Role prompts are stored in `/home/dan/clawd/roles/` (not in this repo):
- `dev.md` - Developer agent prompt
- `reviewer.md` - Reviewer agent prompt
- `pm.md` - Product manager prompt
- `research.md` - Researcher prompt
- `conflict_resolver.md` - Conflict resolver prompt
- `qa.md` - QA agent prompt
- `pe.md` - Prompt engineer prompt

## Nginx Configuration

For HTTPS deployment, WebSocket connections need to be proxied through nginx.

Add to nginx custom config (`/data/nginx/custom/server_proxy.conf` in NPM):

```nginx
# OpenClaw WebSocket proxy (for OpenClutch app)
location = /openclaw-ws {
    proxy_pass http://192.168.7.200:18789/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Origin $http_origin;
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
    proxy_buffering off;
    proxy_cache off;
}
```

After updating, reload nginx:
```bash
docker exec nginx-proxy-manager nginx -t && docker exec nginx-proxy-manager nginx -s reload
```

## Development Commands

```bash
# Type-check
pnpm typecheck

# Lint
pnpm lint

# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Convex dev mode
pnpm convex:dev

# Deploy schema changes
pnpm convex:deploy
```

## Development Notes

### Dev Server

The dev server runs on port 3002 with Turbopack hot-reload:

```bash
pnpm dev
```

**Do not start another dev server** - use `run.sh` for production mode.

### Pre-commit Hooks

Pre-commit hooks run lint and typecheck. **Never use `--no-verify`** - fix any failures before committing.

### Git Worktrees

**Never switch branches in `/home/dan/src/trap`** - the dev server runs there on `main`.

For feature work:
```bash
cd /home/dan/src/trap
git worktree add /home/dan/src/trap-worktrees/fix/<ticket-id> -b fix/<ticket-id>
cd /home/dan/src/trap-worktrees/fix/<ticket-id>
# ... work ...
```

### Debugging

Check OpenClaw logs for connection issues:
```bash
journalctl --user -u openclaw-gateway.service -f --no-pager | grep -i ws
```

Check OpenClutch logs:
```bash
./run.sh logs        # Server logs
./run.sh loop-logs   # Work loop logs
./run.sh all-logs    # All logs
```

### Common Issues

- **"invalid handshake"** - First message must be `connect` with proper params
- **"protocol mismatch"** - Use protocol version 3
- **"Mixed Content"** - HTTPS pages need WSS via nginx proxy
- **Ghost-completing agents** - OpenClaw lane concurrency too low vs OpenClutch agent limits
- **Tasks stuck in_review with 0 reviews** - PR has conflicts, needs conflict_resolver role
