/**
 * Prompt Builder
 *
 * Builds role-specific prompts for sub-agents working on tasks.
 * Fetches the SOUL template from Convex promptVersions (single source of truth)
 * and injects task-specific context.
 */

import type { ConvexHttpClient } from "convex/browser"
import { fetchActivePrompt, PromptNotFoundError } from "./prompt-fetcher"

// ============================================
// Types
// ============================================

export interface TaskComment {
  author: string
  content: string
  timestamp: string
}

export interface PromptParams {
  /** The role of the agent (dev, pm, research, reviewer, conflict_resolver) */
  role: string
  /** The task ID */
  taskId: string
  /** The task title */
  taskTitle: string
  /** The task description */
  taskDescription: string
  /** The project ID */
  projectId: string
  /** The project slug (for CLI commands) */
  projectSlug?: string
  /** The repository directory */
  repoDir: string
  /** The worktree directory for dev tasks */
  worktreeDir: string
  /** Signal Q&A history (for PM tasks with user responses) */
  signalResponses?: Array<{ question: string; response: string }>
  /** Optional image URLs for the PM to analyze */
  imageUrls?: string[]
  /** Optional PR number (for reviewer and conflict_resolver roles) */
  prNumber?: number | null
  /** Optional branch name (for conflict_resolver role) */
  branch?: string | null
  /** Optional task comments for context (from previous work / triage) */
  comments?: TaskComment[]
  /**
   * The SOUL template content for the role.
   * @deprecated Only used by legacy buildPrompt(). Use buildPromptAsync() instead.
   */
  soulTemplate?: string
}

export interface BuildPromptOptions {
  /** Convex client for fetching prompts from DB */
  convex: ConvexHttpClient
  /** Optional fallback behavior if Convex prompt not found */
  allowFallback?: boolean
  /** Optional logger for errors */
  logError?: (message: string) => void
}

// ============================================
// Comment Formatting Helper
// ============================================

/**
 * Format task comments for inclusion in prompts
 * Filters out automated status-change noise and formats chronologically
 */
function formatCommentsSection(comments: TaskComment[] | undefined): string {
  if (!comments || comments.length === 0) {
    return ""
  }

  const formattedComments = comments
    .map((c) => `[${c.timestamp}] ${c.author}: ${c.content}`)
    .join("\n")

  return `
## Task Comments (context from previous work / triage)

${formattedComments}
`
}

// ============================================
// Task Context Builders
// ============================================

/**
 * Build task context section for PM role
 */
function buildPmTaskContext(params: PromptParams): string {
  const imageSection = params.imageUrls && params.imageUrls.length > 0
    ? `\n## Attached Images\n\nThe following images are attached to this task:\n${params.imageUrls.map((url, i) => `- Image ${i + 1}: ${url}`).join('\n')}\n\n**Important:** Analyze these images carefully. They may contain screenshots, diagrams, or visual context crucial for understanding the issue.`
    : ''

  const signalContext = params.signalResponses && params.signalResponses.length > 0
    ? `\n## Previous Clarifying Questions & Answers\n\nThe following questions were asked and answered during triage:\n\n${params.signalResponses.map((s, i) => `**Q${i + 1}:** ${s.question}\n**A${i + 1}:** ${s.response}`).join('\n\n')}\n`
    : ''

  const commentsSection = formatCommentsSection(params.comments)

  return `## Task: ${params.taskTitle}

**Read ${params.repoDir}/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`pm\`

${params.taskDescription}${imageSection}${signalContext}${commentsSection}

---

**Your job:** ${params.signalResponses && params.signalResponses.length > 0
    ? "Analyze this ticket and break it down into actionable sub-tickets using the answers to your clarifying questions."
    : "Triage this issue and either flesh it out and change role to `dev`, or create clarifying questions as blocking signals."
  }`
}

/**
 * Build task context section for Research role
 */
function buildResearchTaskContext(params: PromptParams): string {
  const commentsSection = formatCommentsSection(params.comments)

  return `## Task: ${params.taskTitle}

**Read ${params.repoDir}/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`research\`

${params.taskDescription}${commentsSection}

---

**Your job:** Research this topic and post findings as a comment on the ticket.`
}

/**
 * Build task context section for Reviewer role
 */
function buildReviewerTaskContext(params: PromptParams): string {
  const commentsSection = formatCommentsSection(params.comments)
  const prNumber = params.prNumber ?? "<number>"
  const projectSlug = params.projectSlug ?? "clutch"

  return `## Task: ${params.taskTitle}

**Read ${params.repoDir}/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`reviewer\`

${params.taskDescription}${commentsSection}

---

**Your job:** Review the PR for this ticket.

**Worktree Path:** ${params.worktreeDir}
**PR Number:** #${prNumber}
**Project:** ${projectSlug}

**Review steps:**
1. Read the ticket description above
2. Check the diff: \`gh pr diff ${prNumber}\`
3. Install deps + run verification commands from AGENTS.md: \`cd ${params.worktreeDir}\` then follow the project's build/lint/typecheck instructions
4. If all checks pass → MERGE: \`gh pr merge ${prNumber} --squash --delete-branch\`
5. If issues found → leave rejection feedback in TWO places, then send the task back to dev:
   - GitHub PR comment (so humans see it): \`gh pr comment ${prNumber} --body "<feedback>"\`
   - OpenClutch task comment (so agents see it on retry):
     \`curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments -H 'Content-Type: application/json' -d '{"content": "REVIEW REJECTED (PR #${prNumber}): <feedback>", "author": "reviewer", "author_type": "agent"}'\`

   After posting feedback, move the task back to \`ready\` so a dev agent re-picks it up with the feedback in context:
   \`curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "ready"}'\`

You do NOT have browser access. If UI changes need visual verification, note it in your review comment.

**Your session MUST end with either step 4 (merge) or step 5 (rejection feedback + move to ready).
Finishing without either will block the task and waste a triage cycle.**

## Creating Follow-up Tickets (for non-blocking feedback)

If you find non-blocking improvements (style, small refactors, tech-debt, "would be nicer if..."), create follow-up tickets so they don't get lost.

**Use this CLI command:**
\`\`\`bash
clutch tasks create --project ${projectSlug} --title "Follow-up: <short summary>" --description '<context and suggested change>' --status ready --priority medium --role dev --tags 'follow-up,<area>'
\`\`\`

**Example:**
\`\`\`bash
clutch tasks create --project ${projectSlug} --title "Follow-up: Extract validation logic into shared utility" --description '- Context: Found during review of PR #'${prNumber}'
- Why: The validation logic is duplicated across 3 files
- Suggested change: Extract into a shared validateTask() function in lib/validation.ts

**Acceptance Criteria:**
- [ ] Validation logic extracted into shared utility
- [ ] All existing validation sites updated to use the new utility
- [ ] Tests pass' --status ready --priority medium --role dev --tags 'follow-up,refactor'
\`\`\`

**Important:**
- Use SINGLE QUOTES for --description (double quotes let zsh interpret backticks)
- Always include the \`follow-up\` tag
- Include the PR number in the description for context
- Create one ticket per distinct improvement area (avoid mega-tickets)`
}

/**
 * Build task context section for Conflict Resolver role
 */
function buildConflictResolverTaskContext(params: PromptParams): string {
  const commentsSection = formatCommentsSection(params.comments)

  return `## Task: ${params.taskTitle}

**Read ${params.repoDir}/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`conflict_resolver\`

${params.taskDescription}${commentsSection}

---

**Your job:** Resolve merge conflicts on this PR so it can be reviewed and merged.

**PR Number:** #${params.prNumber}
**Branch:** ${params.branch}
**Worktree Path:** ${params.worktreeDir}

## Conflict Resolution Steps (Headless-Safe)

1. **Navigate to the worktree (should already exist):**
   \`\`\`bash
   cd ${params.worktreeDir}
   git status
   \`\`\`

2. **Fetch latest main and attempt rebase:**
   \`\`\`bash
   git fetch origin main
   GIT_SEQUENCE_EDITOR=true git rebase origin/main
   \`\`\`
   **IMPORTANT:** Never use \`git rebase -i\` (interactive). There is no TTY — interactive rebase will hang and stall the task.

3. **If conflicts occur, analyze them carefully:**
   - Check which files have conflicts: \`git diff --name-only --diff-filter=U\`
   - Read conflict markers and understand both sides
   - Resolve conflicts preserving the intended functionality
   - Prefer the incoming changes from main for structural/deps changes
   - Prefer the branch changes for feature logic

4. **After resolving conflicts:**
   \`\`\`bash
   git add -A
   # Headless-safe: avoid editor prompts (no TTY)
   GIT_EDITOR=true EDITOR=true GIT_SEQUENCE_EDITOR=true git rebase --continue
   \`\`\`
   
   If rebase shows "No changes - did you forget to use 'git add'?", use:
   \`\`\`bash
   GIT_EDITOR=true EDITOR=true GIT_SEQUENCE_EDITOR=true git rebase --skip
   \`\`\`

5. **Verify the resolution** (use the project's verification commands from AGENTS.md — e.g. \`pnpm typecheck && pnpm lint\` for JS, \`uv run pyright && uv run ruff check\` for Python, etc.)

6. **Push the resolved branch (force push required after rebase):**
   \`\`\`bash
   git push --force-with-lease
   \`\`\`

7. **Post success comment and move to in_review (so a reviewer can verify and merge):**
   \`\`\`bash
   curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments -H 'Content-Type: application/json' -d '{"content": "Resolved merge conflicts. Branch rebased onto main and force-pushed. PR is now ready for review.", "author": "agent", "author_type": "agent"}'
   curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "in_review"}'
   \`\`\`
   ⚠️ **NEVER move tasks to done.** Your job is conflict resolution only — a reviewer must review and merge the PR.

## If Conflicts Cannot Be Resolved

If the conflicts are too complex or you're unsure about the correct resolution:

1. **Abort the rebase:**
   \`\`\`bash
   git rebase --abort
   \`\`\`

2. **Identify conflicting files:**
   \`\`\`bash
   git diff --name-only origin/main...HEAD
   \`\`\`

3. **Post comment explaining the blocker and move to blocked:**
   \`\`\`bash
   curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments -H 'Content-Type: application/json' -d '{"content": "Cannot resolve conflicts automatically. Conflicting files: <list files here>. Reason: <specific explanation>", "author": "agent", "author_type": "agent"}'
   curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "blocked"}'
   \`\`\``
}

/**
 * Build task context section for Dev role
 */
function buildDevTaskContext(params: PromptParams): string {
  const branchName = `fix/${params.taskId.slice(0, 8)}`
  const commentsSection = formatCommentsSection(params.comments)

  return `## Task: ${params.taskTitle}

**Read ${params.repoDir}/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`dev\`

${params.taskDescription}${commentsSection}

---

**Setup worktree and record branch:**
\`\`\`bash
cd ${params.repoDir}
git fetch origin main
git worktree add ${params.worktreeDir} origin/main -b ${branchName}
cd ${params.worktreeDir}

# Install dependencies (worktrees don't inherit node_modules)
pnpm install

# Record the branch name on the task
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"branch": "${branchName}"}'

# Post progress comment
curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments -H 'Content-Type: application/json' -d '{"content": "Started work. Branch: \`${branchName}\`, worktree: \`${params.worktreeDir}\`", "author": "agent", "author_type": "agent"}'
\`\`\`

## Pre-commit Rules (MANDATORY)
- **NEVER use \`--no-verify\` on git commit.** Pre-commit hooks exist for a reason.
- If pre-commit checks fail (lint, typecheck, tests), **fix the errors** before committing.
- If a pre-commit failure is in code you didn't touch, fix it anyway — leave the codebase cleaner than you found it.
- Do NOT skip, disable, or work around pre-commit hooks under any circumstances.

## Work Already Completed

**If the work is already done** (e.g., completed by another PR already merged to main):
- Do NOT move the task to done yourself
- Move it to \`in_review\` with a comment explaining what you found:
  \`\`\`bash
  curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments -H 'Content-Type: application/json' -d '{"content": "Work already completed in PR #XXX (commit abc123). Verified: <what you checked>.", "author": "agent", "author_type": "agent"}'
  curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "in_review"}'
  \`\`\`
- A reviewer will verify and close it

**After implementation, push and create PR (follow this EXACT sequence):**

\`\`\`bash
# Step 1: Commit (fix any pre-commit failures before retrying — NEVER use --no-verify)
cd ${params.worktreeDir}
git add -A
git commit -m "feat: <description>"

# Step 2: Push
git push -u origin ${branchName}

# Step 3: Create PR and capture the number
PR_URL=$(gh pr create --title "<title>" --body "Ticket: ${params.taskId}")
PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$')

# Step 4: Verify PR_NUMBER is set (MUST be a number, not empty)
if [ -z "$PR_NUMBER" ]; then echo "ERROR: PR creation failed"; exit 1; fi

# Step 5: Record PR number on the task
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d "{\"pr_number\": $PR_NUMBER}"

# Step 6: Post comment
curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments -H 'Content-Type: application/json' -d "{\"content\": \"Implementation complete. PR #$PR_NUMBER opened.\", \"author\": \"agent\", \"author_type\": \"agent\"}"

# Step 7: LAST — move to in_review (only after PR number is recorded)
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "in_review"}'
\`\`\`

**CRITICAL: Do NOT set status to \`in_review\` unless steps 1-6 succeeded. If any step fails, leave the task in its current status — the loop will retry.**`
}

/**
 * Build the task context section based on role
 */
function buildTaskContext(params: PromptParams): string {
  switch (params.role) {
    case "pm":
      return buildPmTaskContext(params)
    case "research":
    case "researcher":  // Backwards compatibility
      return buildResearchTaskContext(params)
    case "reviewer":
      return buildReviewerTaskContext(params)
    case "conflict_resolver":
      return buildConflictResolverTaskContext(params)
    case "dev":
    default:
      return buildDevTaskContext(params)
  }
}

// ============================================
// Main Prompt Builder
// ============================================

/**
 * Build a complete prompt by fetching the role SOUL template from Convex
 * and injecting task-specific context.
 *
 * This is the primary way to build prompts for sub-agents. It ensures:
 * - The SOUL template comes from Convex promptVersions (single source of truth)
 * - Task-specific instructions are injected as context
 * - Errors loudly if no active prompt version exists for the role
 *
 * @param params - Task and role parameters
 * @param options - Convex client and options
 * @returns The complete prompt string
 * @throws PromptNotFoundError if no active prompt exists for the role (and allowFallback is false)
 */
export async function buildPromptAsync(
  params: PromptParams,
  options: BuildPromptOptions
): Promise<string> {
  const { convex, allowFallback = false, logError } = options

  // Fetch the SOUL template from Convex (single source of truth)
  let soulTemplate: string
  try {
    const promptVersion = await fetchActivePrompt(convex, params.role)
    soulTemplate = promptVersion.content
  } catch (error) {
    if (error instanceof PromptNotFoundError) {
      const message = `No active prompt version found for role: ${params.role}. Run POST /api/prompts/seed to initialize prompts.`
      logError?.(`[PromptBuilder] ${message}`)

      if (!allowFallback) {
        throw new Error(message)
      }

      // Fallback: use a minimal default SOUL template
      logError?.(`[PromptBuilder] Using fallback SOUL template for role: ${params.role}`)
      soulTemplate = `# ${params.role.charAt(0).toUpperCase() + params.role.slice(1)}\n\nYou are a ${params.role} agent. Follow the task instructions below.`
    } else {
      throw error
    }
  }

  // Build task-specific context
  const taskContext = buildTaskContext(params)

  // Combine SOUL template with task context
  return `${soulTemplate}\n\n---\n\n${taskContext}`
}

/**
 * Legacy synchronous prompt builder.
 *
 * ⚠️ DEPRECATED: This function uses hardcoded SOUL templates instead of
 * fetching from Convex promptVersions. Use buildPromptAsync instead.
 *
 * Kept for backwards compatibility during migration.
 *
 * @param params - Task and role parameters including soulTemplate
 * @returns The complete prompt string
 * @deprecated Use buildPromptAsync instead
 */
export function buildPrompt(params: PromptParams): string {
  // Use the provided soulTemplate (loaded from disk by caller)
  const taskContext = buildTaskContext(params)
  return `${params.soulTemplate}\n\n---\n\n${taskContext}`
}

// ============================================
// Backwards Compatibility Exports
// ============================================

// Re-export for convenience
export { PromptNotFoundError } from "./prompt-fetcher"
