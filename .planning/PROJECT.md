# OpenClutch

## What This Is

A web-based dashboard and control center that replaces OpenClaw's built-in Control UI. Connects to OpenClaw's WebSocket API to provide real-time session visibility, cancellation, token/cost analytics, cron management, project-based task organization, and chat — all in one polished interface. Built for a single user initially but designed for release to other OpenClaw users.

## Core Value

See what OpenClaw is doing, kill what needs killing, and keep work organized — without juggling Discord, the built-in UI, and spreadsheets.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Real-time session list with status, model, and token usage
- [ ] Cancel/kill any session or sub-agent
- [ ] Token and cost analytics (by model, session, time period)
- [ ] Cron job monitoring with status, history, manual trigger/pause
- [ ] Project-based organization (groups tasks, crons, chats around a repo or effort)
- [ ] Bidirectional task management (user and AI both create/update tasks)
- [ ] Chat interface connected to OpenClaw
- [ ] Ad-hoc chats (not tied to a project)
- [ ] Project-scoped chats (context defaults to project, but can be manually tagged)
- [ ] Rich widget capability in chat (structured data rendered as cards/charts, not just text)
- [ ] Production-quality codebase (tests, CI, precommit hooks, docs)

### Out of Scope

- Native mobile app — web-first, evaluate native later if voice features need it
- Multi-user auth — single user, no login needed
- Custom widget system (Axiom Trader etc.) — focus on core dashboard first, extensibility later
- 2-way voice — future feature, evaluate web vs native when the time comes
- Tailscale/remote access setup — separate concern, not app code
- Real-time chat streaming via custom protocol — use OpenClaw's existing WebSocket chat API

## Context

- **OpenClaw API**: Comprehensive WebSocket API on port 18789 with 80+ methods covering sessions, cron, chat, config, usage/costs, agents, nodes, and more. Also has OpenAI-compatible REST endpoints.
- **Existing UI**: OpenClaw has a built-in Control UI (Lit/TypeScript, served from gateway). It's functional but ugly, slow, and missing key features like session cancellation and cost tracking.
- **Plugin system**: OpenClaw has an extensible plugin architecture — plugins can register gateway methods, HTTP handlers, tools, channels, services, and CLI commands. This may be useful for the task/todo system.
- **Task data question**: Tasks need to be accessible from any OpenClaw interface (chat, Slack, OpenClutch), not just OpenClutch. Options include OpenClaw's memory system, a dedicated plugin, or native OpenClaw task support. Research needed.
- **Project concept**: A "project" is an organizing layer that groups tasks, cron jobs, and chats. Things get associated via context (start a chat "in" a project) or manual tagging.
- **OpenClaw source**: Available at ~/src/openclaw for reference.

## Constraints

- **Tech stack**: Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui — per README
- **Data transport**: WebSocket client connecting to OpenClaw gateway (ws://localhost:18789)
- **Hosting**: Local on byteFORCE initially
- **Code quality**: Test coverage, CI, precommit hooks, documentation — built to release quality from day one
- **Data ownership**: Prefer data to live in OpenClaw's domain (accessible from any interface) rather than siloed in OpenClutch's database

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Replace existing UI, not extend it | Built-in UI is Lit-based, ugly, slow — cleaner to build fresh with Next.js | — Pending |
| Web app first, not native | Most features work fine in browser; revisit for voice | — Pending |
| Projects as organizing concept | Groups tasks/crons/chats meaningfully, matches how Dan works | — Pending |
| Task data in OpenClaw domain | Must be accessible from any interface (chat, Slack, etc.) | — Pending |
| Release-quality from start | Tests, CI, docs, precommit hooks — not a prototype | — Pending |

---
*Last updated: 2026-02-02 after initialization*
