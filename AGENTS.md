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
read(path="/home/dan/src/trap/some/file.ts")
```
Never call `read()` with no arguments — it will fail. If you need to explore the project structure, use `exec` with `fd`, `rg`, or `cat` instead.

**Prefer `exec` for file exploration.** Use `read` only when you already have a specific file path.

**Common patterns:**
```bash
# Find files by name (fd is available)
fd "\.tsx$" /home/dan/src/trap/app

# Search for code (rg is available — use it instead of grep)
# NOTE: -t ts covers .ts AND .tsx. Do NOT use -t tsx (doesn't exist)
rg "functionName" /home/dan/src/trap/app -t ts

# Read a file
cat /home/dan/src/trap/app/page.tsx

# IMPORTANT: Quote paths with brackets (Next.js [slug] dirs)
cat '/home/dan/src/trap/app/projects/[slug]/page.tsx'

# List directory
ls /home/dan/src/trap/app/
```

## Git Worktrees (REQUIRED)

**NEVER switch branches in `/home/dan/src/trap`** — the dev server runs there on `main`.

**For ALL feature work:**
```bash
# Create worktree for your task
cd /home/dan/src/trap
git worktree add /home/dan/src/trap-worktrees/<branch-name> -b <branch-name>

# Work in the worktree
cd /home/dan/src/trap-worktrees/<branch-name>

# When done (after PR merged), clean up
git worktree remove /home/dan/src/trap-worktrees/<branch-name>
```

Branch naming: `fix/<ticket-id-prefix>-<short-desc>` or `feat/<ticket-id-prefix>-<short-desc>`

**Why:** Switching branches in the main repo kills the running dev server, breaking the app for users.

---

## Ticket Verification (REQUIRED)

**Before marking any ticket as `done`:**

1. **Browser test required** — Actually load the UI and verify the feature works
2. **Screenshot evidence** — Take a screenshot showing the working feature if possible
3. **If you can't test** — Leave ticket in `in_review`, note what needs manual testing

**Do NOT mark done based on:**
- Code compiles ❌
- Tests pass ❌
- PR merged ❌

**Only mark done when:**
- Feature visually works in browser ✅
- Or explicitly noted as "needs manual QA" ✅
