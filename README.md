# 🦞 The Trap

[![CI](https://github.com/dbachelder/the-trap/actions/workflows/ci.yml/badge.svg)](https://github.com/dbachelder/the-trap/actions/workflows/ci.yml)

A custom dashboard and control center for OpenClaw. Built for visibility, control, and sanity.

## Why

The built-in OpenClaw UI is functional but minimal. Discord is great for chat but terrible as a control plane — you can't cancel tasks, can't see what's running, can't track where tokens are going. The Trap fills that gap.

## Goals

### 1. Session Visibility & Control
- Real-time view of all sessions (main, isolated, sub-agents)
- See which model each session is using
- Live activity feed — what's running, what just finished, what failed
- **Cancel/kill buttons** on any session or sub-agent
- Cron job status with manual trigger/pause controls

### 2. Token & Cost Analytics
- Token usage breakdown by model, session, and time period
- Which sub-agents are burning what
- Cost trends over time (daily/weekly/monthly)
- Model usage distribution

### 3. Task Management
- Built-in kanban or list view (replaces GitHub Projects for non-code tasks)
- Ada can create/update tasks, Dan can drag them around
- Priority, status, tags, notes
- Tuned to how we actually work (not GitHub's opinionated workflow)

### 4. Custom Project Widgets
- **Axiom Trader:** positions, P&L, strategy performance, live signals
- Extensible widget system for future projects
- Rich formatted data views (not just text dumps)

### 5. Remote Access (Later)
- Tailscale integration for secure access from anywhere
- No port forwarding or public exposure needed

## Architecture

- **Frontend:** Next.js (React) — fast, SSR-capable, good ecosystem
- **Backend:** Next.js API routes or lightweight Express
- **Data Sources:**
  - OpenClaw Gateway WebSocket + REST API (sessions, cron, config)
  - SQLite (axiom-trader trades.db)
  - Local task database (SQLite or JSON)
- **Hosting:** Local on byteFORCE, port TBD
- **Access:** localhost initially, Tailscale later

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui components
- SQLite (better-sqlite3) for local data
- WebSocket client for real-time OpenClaw data

## Getting Started

```bash
cd /home/dan/src/trap
npm install
npm run dev
```

## Status

🚧 **Planning phase** — laying groundwork.

## Name

"The Trap" — as in lobster trap. Catches everything, gives you visibility into what's below the surface. A nod to Maine roots.
