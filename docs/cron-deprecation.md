# Cron-Based Work Loop — Deprecated

The old cron-based work loop system has been replaced by the persistent worker (`worker/`).

## What Changed

| Component | Old (cron-based) | New (persistent worker) |
|-----------|-------------------|------------------------|
| Scheduling | OpenClaw cron job every 30s | Persistent Node.js process |
| Gate script | `~/bin/clutch-gate.sh` | `worker/loop.ts` with phases |
| Agent spawn | Cron script resolver → sub-agent | `GatewayRpcClient` → real sessions |
| Worktree cleanup | `~/bin/clutch-worktree-cleanup.sh` | `worker/phases/cleanup.ts` |
| Review routing | Gate script section 3 | `worker/phases/review.ts` |

## Archived Files

- `~/bin/archive/clutch-gate.sh.deprecated` — original gate script
- `~/bin/archive/clutch-worktree-cleanup.sh.deprecated` — original cleanup script

Stub scripts remain at the old paths with deprecation notices, so any accidental invocation returns a no-op.

## Cron Jobs Removed

- `clutch-work-loop` (ID `a4512186-e8a2-468b-b0ff-c5525469a628`) — deleted from OpenClaw cron
- No `clutch-qa-loop` job existed

## Why

The cron-based system had limitations:
- 30s polling interval meant slow response to new work
- Script resolver was fragile (shell script parsing JSON, race conditions)
- No persistent state between runs
- Each run was an isolated sub-agent with no context

The persistent worker maintains WebSocket connection to OpenClaw gateway, tracks agent lifecycle, and responds to work immediately.
