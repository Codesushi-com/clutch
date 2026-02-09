# Clutch OpenClaw Plugins

OpenClaw plugins that enable AI agents to communicate with OpenClutch.

## Available Plugins

### clutch-signal.ts

Provides two tools for agent-to-coordinator communication:

| Tool | Purpose |
|------|---------|
| `signal` | Request input, report blockers, escalate issues, or send FYI |
| `mark_complete` | Mark a task as done with summary and optional PR link |

## Installation

### Option 1: Symlink (recommended for development)

```bash
# Create extensions directory if it doesn't exist
mkdir -p ~/.openclaw/extensions

# Symlink the plugin
ln -s /path/to/clutch/plugins/clutch-signal.ts ~/.openclaw/extensions/clutch-signal.ts

# Restart OpenClaw gateway
openclaw gateway restart
```

### Option 2: Add to config

Add to your `openclaw.json`:

```json
{
  "plugins": ["/path/to/clutch/plugins/clutch-signal.ts"]
}
```

### Option 3: Copy to extensions

```bash
cp /path/to/clutch/plugins/clutch-signal.ts ~/.openclaw/extensions/
```

## Configuration

Set the `CLUTCH_URL` environment variable to point to your OpenClutch instance:

```bash
export CLUTCH_URL=http://localhost:3002
```

Or add to your shell profile / OpenClaw environment config.

Default: `http://localhost:3002`

## Usage

Once installed, agents can use these tools:

### signal

Request help or report status to the coordinator.

```typescript
// Ask a question (blocks until answered)
signal({
  taskId: "task-123",
  kind: "question",
  message: "Should the timeout be an env var or config file?"
})

// Report a blocker
signal({
  taskId: "task-123",
  kind: "blocker",
  message: "CI is failing on unrelated test, need help"
})

// Escalate an issue
signal({
  taskId: "task-123",
  kind: "alert",
  severity: "critical",
  message: "Found hardcoded AWS credentials in config.py"
})

// FYI (non-blocking)
signal({
  taskId: "task-123",
  kind: "fyi",
  message: "Refactored auth module while fixing the bug"
})
```

**Signal kinds:**

| Kind | Blocking | Use case |
|------|----------|----------|
| `question` | Yes | Need answer to proceed |
| `blocker` | Yes | Stuck, need help |
| `alert` | Yes | Issue needs attention |
| `fyi` | No | Informational, continue working |

**Severity levels** (for alerts):
- `normal` — Standard priority
- `urgent` — Needs attention soon
- `critical` — Drop everything

### mark_complete

Mark a task as done.

```typescript
// Simple completion
mark_complete({
  taskId: "task-123",
  summary: "Fixed the session timeout bug by making it configurable"
})

// With PR (task goes to "review" status)
mark_complete({
  taskId: "task-123",
  summary: "Implemented signal API with unified endpoint",
  prUrl: "https://github.com/user/repo/pull/98",
  notes: "Also updated the gate endpoint to include signal counts"
})
```

## How It Works

1. Agent calls `signal()` → creates record in the database
2. OpenClutch gate API returns `needsAttention: true`
3. Coordinator (Ada) wakes up, sees pending signal
4. Coordinator responds via `/api/signal/:id/respond`
5. Response is routed back to agent's session via `sessionKey`
6. Agent receives response and continues

The `sessionKey` and `agentId` are automatically injected by OpenClaw — agents don't need to pass them.

## Development

To modify the plugin:

1. Edit `plugins/clutch-signal.ts`
2. Gateway hot-reloads on save (in dev mode)
3. Or restart gateway: `openclaw gateway restart`

## Troubleshooting

**Plugin not loading:**
```bash
# Check gateway logs
journalctl --user -u openclaw-gateway -f

# Verify symlink
ls -la ~/.openclaw/extensions/
```

**Connection refused:**
- Verify the app is running: `curl http://localhost:3002/api/gate`
- Check `CLUTCH_URL` is set correctly

**Tool not available:**
- Restart gateway after installing plugin
- Check for TypeScript errors in plugin file
