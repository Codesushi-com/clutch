# Codebase Concerns

**Analysis Date:** 2026-02-07

## Tech Debt

**Monolithic task domain logic (hard to change safely):**
- Issue: A large, multi-responsibility module mixes validation, ordering, state transitions, event logging, and agent bookkeeping.
- Files: `convex/tasks.ts`
- Impact: Higher chance of regressions in task movement/dispatch/agent tracking; slower iteration due to merge conflicts and difficult review.
- Fix approach: Split `convex/tasks.ts` into focused modules (e.g., `convex/tasks/move.ts`, `convex/tasks/dispatch.ts`, `convex/tasks/agentActivity.ts`) and keep a thin exported surface in `convex/tasks.ts`.

**Work-loop orchestration complexity and duplication:**
- Issue: The work loop includes extensive recovery logic (reaping, orphan recovery, retry rules, analyzer failure recording) in one file and repeats concepts across phases.
- Files: `worker/loop.ts`, `worker/phases/cleanup.ts`, `worker/phases/work.ts`, `worker/phases/review.ts`
- Impact: Changes to lifecycle rules are brittle; edge cases create “stuck” tasks that require manual recovery.
- Fix approach: Extract a single “task lifecycle/recovery” module (pure functions + clear invariants) and unit test it; keep phase runners thin.

**Hard-coded machine-specific paths and environment assumptions:**
- Issue: Absolute paths and user-specific directories are embedded in runtime code.
- Files: `app/api/voice/route.ts`, `worker/phases/work.ts`, `app/api/prompts/seed/route.ts`
- Impact: Non-portable deployments; failures outside the author’s machine; makes dev/prod parity impossible.
- Fix approach: Replace absolute paths with env-configured paths (validated at startup), and/or ship required templates/assets in-repo.

**Platform-specific external command dependencies:**
- Issue: The system executes OS commands (and assumes GNU tools) as part of normal operation.
- Files: `app/api/sessions/status/route.ts` (runs `openclaw`), `worker/session-file-reader.ts` (runs `tail`), `worker/phases/cleanup.ts` (runs `find`, `git`)
- Impact: Breaks on non-Linux environments; increases operational fragility; harder to secure.
- Fix approach: Prefer Node APIs (fs streaming, directory traversal) and library calls; isolate command execution behind a single adapter with strict allowlists.

**JSON-in-string fields (schema drift and parse failures):**
- Issue: Several fields are stored as JSON strings and parsed at read-time without defensive parsing.
- Files: `convex/schema.ts` (`tasks.tags`), `convex/chats.ts` (`chats.participants`), `convex/metrics.ts` (`failure_modes`), `convex/taskAnalyses.ts` (`failure_modes`, `amendments`), `convex/promptMetrics.ts` (`failure_modes`)
- Impact: Any malformed stored value can throw during queries and break pages; hard to evolve schema.
- Fix approach: Migrate to structured Convex fields (arrays/objects) or centralize parse/serialize with validation + fallbacks.

## Known Bugs

**Session history route claims a fallback but returns 404:**
- Symptoms: Documentation says it “falls back to gateway RPC” but it returns `{ error: "Session not found" }` when the JSONL file is missing.
- Files: `app/api/sessions/[sessionKey]/history/route.ts`
- Trigger: Requesting a session key that isn’t present on disk.
- Workaround: None in code; callers must handle 404.

**Inconsistent OpenClaw RPC transport (HTTP vs WS):**
- Symptoms: Some code assumes an HTTP `/rpc` endpoint, while the API proxy explicitly states OpenClaw only speaks WebSocket for RPC.
- Files: `lib/openclaw/rpc.ts`, `app/api/openclaw/rpc/route.ts`
- Trigger: Using `openclawRpc()` server-side (non-browser) against a gateway without HTTP support.
- Workaround: Use `app/api/openclaw/rpc/route.ts` (WS bridge) for browser calls; avoid server-side use of `lib/openclaw/rpc.ts` unless HTTP exists.

**Work-loop config API can error if `.env.local` is absent:**
- Symptoms: GET/PATCH will 500 if `.env.local` does not exist or is unreadable.
- Files: `app/api/work-loop/config/route.ts`
- Trigger: Fresh setup without `.env.local`.
- Workaround: Manually create `.env.local` before calling the API.

## Security Considerations

**No auth/authz on sensitive API routes (read/write):**
- Risk: Any caller with network access can create/update/delete tasks and projects, dispatch agents, trigger OpenClaw RPC, read local files, and mutate runtime config.
- Files: `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`, `app/api/projects/route.ts`, `app/api/projects/[id]/route.ts`, `app/api/openclaw/rpc/route.ts`, `app/api/projects/[id]/context/route.ts`, `app/api/work-loop/config/route.ts`, `app/api/validate/path/route.ts`, `app/api/sessions/[sessionKey]/history/route.ts`, `app/api/upload/image/route.ts`, `app/api/prompts/seed/route.ts`
- Current mitigation: Not detected.
- Recommendations: Add authentication + authorization (at minimum an internal admin token) and enforce it in every `app/api/**/route.ts` handler.

**Path traversal + sensitive path disclosure via session history:**
- Risk: `sessionKey` is decoded and interpolated into a file name; `join(..., `${sessionKey}.jsonl`)` can traverse with `../` and the route returns the local path in the response.
- Files: `app/api/sessions/[sessionKey]/history/route.ts`
- Current mitigation: None (no sanitization/allowlist).
- Recommendations: Enforce a strict session key regex (no slashes/dots), never return absolute paths, and use a fixed directory lookup instead of string interpolation.

**Filesystem enumeration / server path leakage:**
- Risk: The validate-path endpoint resolves arbitrary paths and returns `resolved` plus access errors.
- Files: `app/api/validate/path/route.ts`
- Current mitigation: None.
- Recommendations: Remove this endpoint in production builds, or restrict to paths under an approved base directory (project root/workspaces) and require auth.

**Local file exfiltration via “project context” endpoints:**
- Risk: APIs return contents of local files (e.g., `AGENTS.md`, `README.md`) from `project.local_path`.
- Files: `lib/project-context.ts`, `app/api/projects/[id]/context/route.ts`, `lib/dispatch/context.ts`, `app/api/tasks/[id]/dispatch/route.ts`, `app/api/dispatch/pending/route.ts`
- Current mitigation: Size limits exist (`lib/project-context.ts`), but access control is not present.
- Recommendations: Require auth, restrict which projects can expose context, and strip/deny sensitive files (e.g., `.env*`, secrets, private keys).

**Arbitrary gateway RPC exposure (remote control surface):**
- Risk: The OpenClaw proxy forwards an arbitrary `method` and `params` to a privileged server-side WebSocket client.
- Files: `app/api/openclaw/rpc/route.ts`, `lib/openclaw/client.ts`
- Current mitigation: None (no method allowlist).
- Recommendations: Add an allowlist of RPC methods, rate limit, and require auth; log and reject unknown methods.

**Token exposure risk via NEXT_PUBLIC env usage:**
- Risk: `NEXT_PUBLIC_OPENCLAW_TOKEN` is treated as an auth token and is accessible to browser bundles by design.
- Files: `lib/openclaw/rpc.ts`
- Current mitigation: None.
- Recommendations: Use server-only env vars for secrets (no `NEXT_PUBLIC_`), and authenticate browser requests via the server proxy (`app/api/openclaw/rpc/route.ts`).

**XSS risk in markdown editor preview:**
- Risk: User-controlled content is converted to HTML via regex replacements without escaping, then injected with `dangerouslySetInnerHTML`.
- Files: `components/editors/markdown-editor.tsx`
- Current mitigation: Not detected.
- Recommendations: Replace with `react-markdown` (as used in `components/chat/markdown-content.tsx`) or escape HTML properly and disallow raw HTML.

**RCE / command injection risk in voice API:**
- Risk: Shell commands are assembled as strings and executed via `exec()`. The synthesized response string is injected into a shell command with incomplete escaping.
- Files: `app/api/voice/route.ts`
- Current mitigation: Quotes/escaping for `"` only.
- Recommendations: Replace `exec()` with `execFile()` (no shell), pass arguments as arrays, and remove hard-coded local paths (`/home/dan/...`).

**Unrestricted public uploads:**
- Risk: Anyone can upload images to `public/uploads/images` and receive a public URL.
- Files: `app/api/upload/image/route.ts`
- Current mitigation: MIME allowlist and size limit.
- Recommendations: Require auth, validate file signatures (magic bytes), store outside `public/` (or behind signed URLs), and add quotas/rate limiting.

## Performance Bottlenecks

**N+1 queries in chat listing:**
- Problem: For each chat, the last message is queried separately.
- Files: `convex/chats.ts`
- Cause: `Promise.all(chats.map(async ... query chatMessages ...))`.
- Improvement path: Store `last_message_*` on the chat document or query last messages in one indexed pass.

**N+1 queries in project listing:**
- Problem: Project queries fetch all tasks per project to compute counts.
- Files: `convex/projects.ts`, `app/api/projects/[id]/route.ts`
- Cause: Per-project task collection (`.collect()`) and client-side counting.
- Improvement path: Maintain counters or compute via indexed aggregations; avoid collecting full task lists for counts.

**Full-table scans and in-memory filtering for metrics:**
- Problem: Metrics endpoints collect entire tables and filter in JS.
- Files: `convex/metrics.ts`
- Cause: `ctx.db.query('taskAnalyses').collect()` followed by in-memory filters.
- Improvement path: Add indexes (e.g., `by_role_model_time`) and query with index predicates.

**Blocking sync child-process calls in request paths:**
- Problem: Synchronous CLI calls block the Node event loop.
- Files: `app/api/sessions/status/route.ts`, `worker/session-file-reader.ts`, `worker/phases/cleanup.ts`
- Cause: `execFileSync(...)` on hot paths.
- Improvement path: Use async execution + caching, and/or move polling to background workers.

**Reading entire JSONL session files into memory:**
- Problem: Session history reads full JSONL file and splits into lines.
- Files: `app/api/sessions/[sessionKey]/history/route.ts`
- Cause: `readFile(...).split("\n")`.
- Improvement path: Stream and paginate; cap max bytes/lines returned.

**Sequential per-task processing in pending dispatch listing:**
- Problem: Pending dispatch route loops tasks and does multiple Convex calls per task.
- Files: `app/api/dispatch/pending/route.ts`
- Cause: `for (const task of tasks) { await convex.query(...); await buildTaskContext(...) }`.
- Improvement path: Parallelize with `Promise.all` and reduce per-task queries by batching.

## Fragile Areas

**Worktree cleanup is destructive and OS-dependent:**
- Files: `worker/phases/cleanup.ts`
- Why fragile: Removes worktrees with `git worktree remove ... --force` and uses `find` to enumerate directories.
- Safe modification: Gate removals behind additional checks (e.g., explicit metadata file in worktree), avoid `--force` where possible, and prefer Node directory traversal.
- Test coverage: Not detected.

**Session parsing depends on OS tools and heuristic completion:**
- Files: `worker/session-file-reader.ts`
- Why fragile: Uses `tail` binary and decides “done” via `stopReason === "stop"`.
- Safe modification: Read files via Node streams and treat completion using explicit session_end records (or a more complete stopReason set).
- Test coverage: Not detected.

**Agent orchestration is coupled to local filesystem + in-memory state:**
- Files: `worker/loop.ts`, `worker/agent-manager.ts`, `worker/phases/work.ts`, `lib/dispatch/context.ts`
- Why fragile: A process restart loses in-memory agent state; multiple instances can race; relies on local paths existing and being correct.
- Safe modification: Introduce a shared lock/state in Convex and make operations idempotent.
- Test coverage: Not detected.

## Scaling Limits

**Single-process assumptions (no distributed coordination):**
- Current capacity: Implicitly bounded by `WORK_LOOP_MAX_*` env config and in-memory `AgentManager`.
- Limit: Multiple worker instances can double-claim tasks or interfere with reaping/cleanup.
- Files: `worker/loop.ts`, `worker/phases/work.ts`, `worker/agent-manager.ts`
- Scaling path: Add a distributed lease/lock per task/phase in Convex and design all transitions to be idempotent.

## Dependencies at Risk

**Operational dependencies on local binaries and CLI tooling:**
- Risk: Runtime functionality requires tools that may not be present in production images.
- Impact: Features silently degrade or hard-fail.
- Files: `app/api/voice/route.ts` (ffmpeg, whisper, uv/python), `app/api/sessions/status/route.ts` (openclaw), `worker/session-file-reader.ts` (tail), `worker/phases/cleanup.ts` (find, git)
- Migration plan: Replace with library calls or ship these as explicit runtime dependencies with environment validation at startup.

## Missing Critical Features

**Security controls expected for network-exposed services:**
- Problem: No authentication, authorization, rate limiting, CSRF protection, or request origin checks detected in API routes.
- Blocks: Safe deployment outside a trusted localhost/network.
- Files: `app/api/**/route.ts` (multiple endpoints listed above)

## Test Coverage Gaps

**Only narrow unit/UI tests exist; critical flows are untested:**
- What's not tested: API routes, Convex mutations/queries, work-loop phases, and security-sensitive file/RPC handling.
- Files: Existing tests: `worker/children.test.ts`, `test/role-selector.test.tsx`
- Risk: Regressions in task lifecycle, agent spawning/reaping, and security boundaries go unnoticed.
- Priority: High

---

*Concerns audit: 2026-02-07*
