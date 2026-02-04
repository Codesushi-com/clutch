# The Trap

AI agent orchestration system where Ada serves as coordinator for specialized sub-agents.

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run production server
PORT=3002 npm run start
```

**Dev URL:** http://192.168.7.200:3002  
**Prod URL:** https://ada.codesushi.com

## Architecture

### Core Concept
- **Ada (Opus)** - Coordinator agent, maintains state via board
- **Worker Agents** - Stateless, fresh session per task (kimi-coder, sonnet-reviewer, haiku-triage)
- **Board** - SQLite-backed task management (replaces GitHub Projects)
- **Chat** - Bidirectional communication with OpenClaw main session

### Tech Stack
- Next.js 15, TypeScript, React 19
- SQLite (better-sqlite3, WAL mode)
- Zustand for state management
- Tailwind + shadcn/ui
- WebSocket for real-time updates

## Database

Location: `~/.trap/trap.db`

Tables:
- `projects` - Project metadata, repo links
- `tasks` - Kanban tasks with status, priority, assignee
- `comments` - Task comments for agent communication
- `chats` - Chat threads per project
- `chat_messages` - Chat message history
- `signals` - Agent signals (questions, blockers, alerts)
- `notifications` - System notifications
- `events` - Activity log

Run migrations:
```bash
npm run migrate
```

## OpenClaw Integration

### WebSocket Chat

The Trap connects to OpenClaw via WebSocket for real-time chat. The connection uses OpenClaw's protocol v3:

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

// RPC request format
{
  type: "req",
  id: "<uuid>",
  method: "<method>",
  params: { ... }
}

// Response format
{
  type: "res",
  id: "<uuid>",
  ok: true/false,
  payload: { ... },
  error: { code, message }
}

// Event format  
{
  type: "event",
  event: "<event-name>",
  payload: { ... }
}
```

### Channel Plugin

The trap-channel plugin enables bidirectional messaging:
- Plugin location: `plugins/trap-channel.ts`
- Symlink to: `~/.openclaw/extensions/trap-channel.ts`
- Manifest: `~/.openclaw/extensions/openclaw.plugin.json`

## Nginx Configuration

For HTTPS deployment, WebSocket connections need to be proxied through nginx to avoid mixed-content errors.

Add to nginx custom config (`/data/nginx/custom/server_proxy.conf` in NPM):

```nginx
# OpenClaw WebSocket proxy (for Trap app)
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

## Environment Variables

Create `.env.local`:

```bash
# OpenClaw API (server-side)
OPENCLAW_HOOKS_URL=http://localhost:18789/hooks
OPENCLAW_HOOKS_TOKEN=<your-hooks-token>

# OpenClaw WebSocket (client-side, for HTTP dev only)
NEXT_PUBLIC_OPENCLAW_WS_URL=ws://192.168.7.200:18789/ws
NEXT_PUBLIC_OPENCLAW_TOKEN=<your-gateway-token>

# For HTTPS, WebSocket URL is auto-detected as wss://<host>/openclaw-ws
```

## Project Structure

```
trap/
├── app/                    # Next.js app router
│   ├── api/               # API routes
│   │   ├── chats/         # Chat CRUD
│   │   ├── tasks/         # Task CRUD
│   │   ├── projects/      # Project CRUD
│   │   ├── signal/        # Agent signal API
│   │   └── gate/          # Wake condition API
│   └── projects/[slug]/   # Project pages (board, chat, etc)
├── components/            # React components
│   ├── board/            # Kanban board components
│   ├── chat/             # Chat UI components
│   └── providers/        # Context providers
├── lib/
│   ├── db/               # Database (schema, migrations)
│   ├── hooks/            # React hooks (useOpenClawChat, etc)
│   └── stores/           # Zustand stores
├── plugins/              # OpenClaw plugins
│   └── trap-channel.ts   # Channel plugin for bidirectional chat
└── bin/
    └── trap-gate.sh      # Gate script for cron-based wakeups
```

## Development Notes

### Running Trap Server

Production mode (recommended for HTTPS testing):
```bash
cd /home/dan/src/trap
npm run build
PORT=3002 npm run start
```

Development mode:
```bash
npm run dev
```

### Debugging WebSocket

Check OpenClaw logs for connection issues:
```bash
journalctl --user -u openclaw-gateway.service -f --no-pager | grep -i ws
```

Common issues:
- **"invalid handshake"** - First message must be `connect` with proper params
- **"protocol mismatch"** - Use protocol version 3
- **"Mixed Content"** - HTTPS pages need WSS via nginx proxy
- **"invalid request frame"** - All requests need `type: "req"` field
