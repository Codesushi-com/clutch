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
