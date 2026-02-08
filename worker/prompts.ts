/**
 * Prompt Builder
 *
 * Builds role-specific prompts for sub-agents working on tasks.
 * Replicates the logic from the gate script with proper typing.
 */

// ============================================
// Types
// ============================================

export interface TaskComment {
  author: string
  content: string
  timestamp: string
}

export interface PromptParams {
  /** The role of the agent (dev, pm, qa, research, reviewer, fixer) */
  role: string
  /** The task ID */
  taskId: string
  /** The task title */
  taskTitle: string
  /** The task description */
  taskDescription: string
  /** The SOUL template content for the role */
  soulTemplate: string
  /** The project ID */
  projectId: string
  /** The repository directory */
  repoDir: string
  /** The worktree directory for dev tasks */
  worktreeDir: string
  /** Signal Q&A history (for PM tasks with user responses) */
  signalResponses?: Array<{ question: string; response: string }>
  /** Optional image URLs for the PM to analyze */
  imageUrls?: string[]
  /** Optional PR number (for fixer role) */
  prNumber?: number | null
  /** Optional branch name (for fixer role) */
  branch?: string | null
  /** Optional review comments (for fixer role) */
  reviewComments?: string | null
  /** Optional task comments for context (from previous work / triage) */
  comments?: TaskComment[]
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
// Role-Specific Instructions
// ============================================

/**
 * Build PM role instructions for triage mode
 */
function buildPmInstructions(params: PromptParams): string {
  const imageSection = params.imageUrls && params.imageUrls.length > 0
    ? `\n## Attached Images\n\nThe following images are attached to this task:\n${params.imageUrls.map((url, i) => `- Image ${i + 1}: ${url}`).join('\n')}\n\n**Important:** Analyze these images carefully. They may contain screenshots, diagrams, or visual context crucial for understanding the issue.`
    : ''

  const commentsSection = formatCommentsSection(params.comments)

  return `## Task: ${params.taskTitle}

**Read ${params.repoDir}/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`pm\`
Mode: **TRIAGE**

${params.taskDescription}${imageSection}${commentsSection}

---

**Your job:** Triage this issue and either:
1. **Flesh it out** and change role to \`dev\` if it's clear enough
2. **Create clarifying questions** as blocking signals if it needs more info

## Completion Contract (REQUIRED)

Before you finish, you MUST update the task status. Choose ONE:

### Task completed successfully:
- Dev with PR: \`curl -X PATCH http://localhost:3002/api/tasks/{TASK_ID} -H 'Content-Type: application/json' -d '{"status": "in_review", "pr_number": NUM, "branch": "BRANCH"}'\`
- Other roles: \`curl -X PATCH http://localhost:3002/api/tasks/{TASK_ID} -H 'Content-Type: application/json' -d '{"status": "done"}'\`

### CANNOT complete the task:
Post a comment explaining why, then move to blocked:
1. \`curl -X POST http://localhost:3002/api/tasks/{TASK_ID}/comments -H 'Content-Type: application/json' -d '{"content": "Blocked: [specific reason]", "author": "agent", "author_type": "agent", "type": "message"}'\`
2. \`curl -X PATCH http://localhost:3002/api/tasks/{TASK_ID} -H 'Content-Type: application/json' -d '{"status": "blocked"}'\`

NEVER finish without updating the task status. If unsure, move to blocked with an explanation.

### Triage Decision Guide

**FLESH OUT when the issue has:**
- Clear goal or user story
- Some context about what needs to change
- Enough to identify which files/components are involved

**ASK QUESTIONS when:**
- The goal is vague ("fix the thing")
- No files or components are mentioned
- Acceptance criteria are missing and unclear
- The scope could be interpreted multiple ways
- Images show issues but don't explain expected behavior

### If Fleshing Out

Update the task with a complete description:
\`\`\`bash
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{
  "description": "## Summary\\n\\nWhat this does...\\n\\n## Implementation\\n\\nHow to implement...\\n\\n## Files\\n\\n- \\"/path/to/file.ts\\"\\n\\n## Acceptance Criteria\\n\\n- [ ] Criterion 1\\n- [ ] Criterion 2\\n- [ ] Criterion 3",
  "role": "dev"
}'
\`\`\`

### If Asking Questions

Create a blocking signal (get your session key from the task first):
\`\`\`bash
# Get your session key from the task
SESSION_KEY=$(curl -s http://localhost:3002/api/tasks/${params.taskId} | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4)

# Create the blocking question signal
curl -X POST http://localhost:3002/api/signal -H 'Content-Type: application/json' -d "{
  \"taskId\": \"${params.taskId}\",
  \"sessionKey\": \"$SESSION_KEY\",
  \"agentId\": \"pm\",
  \"kind\": \"question\",
  \"message\": \"Your specific question here referencing the ambiguity\"
}"
\`\`\`

Then mark yourself done (the signal remains as the blocker):
\`\`\`bash
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "done"}'
\`\`\``
}

/**
 * Build PM role instructions with signal Q&A context
 * Used when the PM task has been re-queued after receiving user responses to signals
 */
function buildPmInstructionsWithSignals(
  params: PromptParams,
  signals: Array<{ question: string; response: string }>
): string {
  const signalContext = signals.length > 0
    ? `
## Previous Clarifying Questions & Answers

The following questions were asked and answered during triage:

${signals.map((s, i) => `**Q${i + 1}:** ${s.question}\n**A${i + 1}:** ${s.response}`).join('\n\n')}

---
`
    : ''

  const commentsSection = formatCommentsSection(params.comments)

  return `## Task: ${params.taskTitle}

**Read ${params.repoDir}/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`pm\`

${params.taskDescription}

${signalContext}${commentsSection}---

**Your job:** Analyze this ticket and break it down into actionable sub-tickets.

**You have received answers to your clarifying questions (see above).** Use this information to finalize the ticket breakdown.

**IMPORTANT:** Every sub-ticket MUST have:
- \`role\` set (usually \`dev\`, or \`qa\`/\`research\` if appropriate)
- Clear description with ## Summary, ## Implementation, ## Files, ## Acceptance Criteria
- Proper priority (urgent/high/medium/low)

**Create tickets:**
\`\`\`bash
curl -X POST http://localhost:3002/api/tasks -H 'Content-Type: application/json' -d '{
  "project_id": "${params.projectId}",
  "title": "<title>",
  "description": "<markdown description>",
  "status": "ready",
  "priority": "<urgent|high|medium|low>",
  "role": "dev",
  "tags": "[\\"tag1\\", \"tag2\"]"
}'
\`\`\`

**Create dependencies between tickets** (task cannot start until dependency is done):
\`\`\`bash
curl -X POST http://localhost:3002/api/tasks/<TASK_ID>/dependencies -H 'Content-Type: application/json' -d '{
  "depends_on_id": "<DEPENDENCY_TASK_ID>"
}'
\`\`\`

Use the task IDs from the POST responses to wire up the dependency chain. If ticket B depends on ticket A, create the dependency after both exist.

## Completion Contract (REQUIRED)

Before you finish, you MUST update the task status. Choose ONE:

### Task completed successfully:
- Dev with PR: \`curl -X PATCH http://localhost:3002/api/tasks/{TASK_ID} -H 'Content-Type: application/json' -d '{"status": "in_review", "pr_number": NUM, "branch": "BRANCH"}'\`
- Other roles: \`curl -X PATCH http://localhost:3002/api/tasks/{TASK_ID} -H 'Content-Type: application/json' -d '{"status": "done"}'\`

### CANNOT complete the task:
Post a comment explaining why, then move to blocked:
1. \`curl -X POST http://localhost:3002/api/tasks/{TASK_ID}/comments -H 'Content-Type: application/json' -d '{"content": "Blocked: [specific reason]", "author": "agent", "author_type": "agent", "type": "message"}'\`
2. \`curl -X PATCH http://localhost:3002/api/tasks/{TASK_ID} -H 'Content-Type: application/json' -d '{"status": "blocked"}'\`

NEVER finish without updating the task status. If unsure, move to blocked with an explanation.

**DO NOT:** Create branches, write code, or create PRs. You are a PM.`
}
/**
 * Build Research role instructions
 */
function buildResearchInstructions(params: PromptParams): string {
  const commentsSection = formatCommentsSection(params.comments)

  return `## Task: ${params.taskTitle}

**Read ${params.repoDir}/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`research\`

${params.taskDescription}${commentsSection}

---

**Your job:** Research this topic and post findings.

Write findings as a comment on the ticket:
\`\`\`bash
curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments -H 'Content-Type: application/json' -d '{"content": "<findings>", "author": "agent", "author_type": "agent"}'
\`\`\`

## Completion Contract (REQUIRED)

Before you finish, you MUST update the task status. Choose ONE:

### Task completed successfully:
- Dev with PR: \`curl -X PATCH http://localhost:3002/api/tasks/{TASK_ID} -H 'Content-Type: application/json' -d '{"status": "in_review", "pr_number": NUM, "branch": "BRANCH"}'\`
- Other roles: \`curl -X PATCH http://localhost:3002/api/tasks/{TASK_ID} -H 'Content-Type: application/json' -d '{"status": "done"}'\`

### CANNOT complete the task:
Post a comment explaining why, then move to blocked:
1. \`curl -X POST http://localhost:3002/api/tasks/{TASK_ID}/comments -H 'Content-Type: application/json' -d '{"content": "Blocked: [specific reason]", "author": "agent", "author_type": "agent", "type": "message"}'\`
2. \`curl -X PATCH http://localhost:3002/api/tasks/{TASK_ID} -H 'Content-Type: application/json' -d '{"status": "blocked"}'\`

NEVER finish without updating the task status. If unsure, move to blocked with an explanation.

**DO NOT:** Create branches or write code unless the ticket explicitly asks for a prototype.`
}

/**
 * Build Reviewer role instructions
 */
function buildReviewerInstructions(params: PromptParams): string {
  const commentsSection = formatCommentsSection(params.comments)

  return `## Task: ${params.taskTitle}

**Read ${params.repoDir}/AGENTS.md first** (use: \`exec(command="cat ${params.repoDir}/AGENTS.md")\`).

## Tool Usage (CRITICAL)
- **\`read\` tool REQUIRES a \`path\` parameter.** Never call read() with no arguments.
- **Use \`exec\` with \`cat\` to read files:** \`exec(command="cat /path/to/file.ts")\`
- **Use \`rg\` to search code:** \`exec(command="rg 'pattern' /path -t ts")\` (note: \`-t ts\` covers both .ts AND .tsx — do NOT use \`-t tsx\`, it doesn't exist)
- **Use \`fd\` to find files:** \`exec(command="fd '\\.tsx$' /path")\`
- **Quote paths with brackets:** Next.js uses \`[slug]\` dirs — always quote these in shell: \`cat '/path/app/projects/[slug]/page.tsx'\`

Ticket ID: \`${params.taskId}\`
Role: \`reviewer\`

${params.taskDescription}${commentsSection}

---

**Your job:** Review the PR for this ticket.

**Review steps:**
1. Check the diff: \`gh pr diff <number>\`
2. Verify types: \`cd ${params.worktreeDir} && pnpm typecheck\`
3. Verify lint: \`cd ${params.worktreeDir} && pnpm lint\`
4. **You do NOT have browser access.** If UI changes need visual verification, note it in your review comment

**Pre-commit Rules:** If you need to make any commits (e.g., fixing issues before merge), **NEVER use \`--no-verify\`.** Fix all pre-commit errors properly.

**If approved (MERGE REQUIRED):**
\`\`\`bash
# YOU MUST MERGE THE PR AFTER APPROVING - this is a required step
gh pr merge <number> --squash --delete-branch

# Update task status
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "done"}'

# Clean up worktree
cd ${params.repoDir} && git worktree remove ${params.worktreeDir} --force 2>/dev/null || true
\`\`\`

**CRITICAL:** Approving a PR without merging it will cause the task to be blocked. You MUST run \`gh pr merge\` after your review passes.

**If lint/typecheck fails:** Check whether the failures are **from this PR's changes** or **pre-existing**.
- If caused by this PR → reject, move to blocked with specific feedback.
- If pre-existing (errors in files not touched by this PR) → **merge anyway**. Pre-existing issues are not this PR's problem. They'll get cleaned up over time.

**If issues found:** Leave a PR comment, move ticket to blocked:
\`\`\`bash
gh pr comment <number> --body '<specific feedback>'
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "blocked"}'
\`\`\`

## Completion Contract (REQUIRED)

Before you finish, you MUST update the task status. Choose ONE:

### Task completed successfully:
- Dev with PR: \`curl -X PATCH http://localhost:3002/api/tasks/{TASK_ID} -H 'Content-Type: application/json' -d '{"status": "in_review", "pr_number": NUM, "branch": "BRANCH"}'\`
- Other roles: \`curl -X PATCH http://localhost:3002/api/tasks/{TASK_ID} -H 'Content-Type: application/json' -d '{"status": "done"}'\`

### CANNOT complete the task:
Post a comment explaining why, then move to blocked:
1. \`curl -X POST http://localhost:3002/api/tasks/{TASK_ID}/comments -H 'Content-Type: application/json' -d '{"content": "Blocked: [specific reason]", "author": "agent", "author_type": "agent", "type": "message"}'\`
2. \`curl -X PATCH http://localhost:3002/api/tasks/{TASK_ID} -H 'Content-Type: application/json' -d '{"status": "blocked"}'\`

NEVER finish without updating the task status. If unsure, move to blocked with an explanation.`
}

/**
 * Build Dev role instructions (default)
 */
function buildDevInstructions(params: PromptParams): string {
  const branchName = `fix/${params.taskId.slice(0, 8)}`
  const commentsSection = formatCommentsSection(params.comments)

  return `## Task: ${params.taskTitle}

**Read ${params.repoDir}/AGENTS.md first** (use: \`exec(command="cat ${params.repoDir}/AGENTS.md")\`).

## Tool Usage (CRITICAL)
- **\`read\` tool REQUIRES a \`path\` parameter.** Never call read() with no arguments.
- **Use \`exec\` with \`cat\` to read files:** \`exec(command="cat /path/to/file.ts")\`
- **Use \`rg\` to search code:** \`exec(command="rg 'pattern' ${params.worktreeDir}/app -t ts")\` (note: \`-t ts\` covers both .ts AND .tsx — do NOT use \`-t tsx\`, it doesn't exist)
- **Use \`fd\` to find files:** \`exec(command="fd '\\.tsx$' ${params.worktreeDir}/app")\`
- **Quote paths with brackets:** Next.js uses \`[slug]\` dirs — always quote these in shell: \`cat '${params.worktreeDir}/app/projects/[slug]/page.tsx'\`
- **All work happens in your worktree:** \`${params.worktreeDir}\` (NOT in ${params.repoDir})

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

**After implementation, push and create PR:**
\`\`\`bash
cd ${params.worktreeDir}
git add -A
git commit -m "feat: <description>"
# If commit fails due to pre-commit hooks, fix ALL errors and retry. Do NOT use --no-verify.
git push -u origin ${branchName}
\`\`\`

Create the PR and capture the PR number:
\`\`\`bash
# Create PR and extract the PR number from the URL
PR_URL=$(gh pr create --title "<title>" --body "Ticket: ${params.taskId}")
PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$')
PR_TITLE="<title>"

# Record the PR number on the task
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d "{\"pr_number\": $PR_NUMBER}"

# Post progress comment
curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments -H 'Content-Type: application/json' -d "{\"content\": \"Implementation complete. PR #$PR_NUMBER opened: $PR_TITLE\", \"author\": \"agent\", \"author_type\": \"agent\"}"
\`\`\`

Then update ticket to in_review:
\`\`\`bash
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "in_review"}'
\`\`\`

## Completion Contract (REQUIRED)

Before you finish, you MUST update the task status. Choose ONE:

### Task completed successfully:
- Dev with PR: \`curl -X PATCH http://localhost:3002/api/tasks/{TASK_ID} -H 'Content-Type: application/json' -d '{"status": "in_review", "pr_number": NUM, "branch": "BRANCH"}'\`
- Other roles: \`curl -X PATCH http://localhost:3002/api/tasks/{TASK_ID} -H 'Content-Type: application/json' -d '{"status": "done"}'\`

### CANNOT complete the task:
Post a comment explaining why, then move to blocked:
1. \`curl -X POST http://localhost:3002/api/tasks/{TASK_ID}/comments -H 'Content-Type: application/json' -d '{"content": "Blocked: [specific reason]", "author": "agent", "author_type": "agent", "type": "message"}'\`
2. \`curl -X PATCH http://localhost:3002/api/tasks/{TASK_ID} -H 'Content-Type: application/json' -d '{"status": "blocked"}'\`

NEVER finish without updating the task status. If unsure, move to blocked with an explanation.`
}
export function buildPrompt(params: PromptParams): string {
  const roleInstructions = (() => {
    switch (params.role) {
      case "pm": {
        // If there are signal responses, use the enhanced prompt
        if (params.signalResponses && params.signalResponses.length > 0) {
          return buildPmInstructionsWithSignals(params, params.signalResponses)
        }
        return buildPmInstructions(params)
      }
      case "research":
      case "researcher":
        return buildResearchInstructions(params)
      case "reviewer":
        return buildReviewerInstructions(params)
      case "dev":
      default:
        return buildDevInstructions(params)
    }
  })()

  return `${params.soulTemplate}

---

${roleInstructions}`
}
