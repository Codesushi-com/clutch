/**
 * Prompt Builder
 *
 * Builds role-specific prompts for sub-agents working on tasks.
 * Replicates the logic from the gate script with proper typing.
 */

// ============================================
// Types
// ============================================

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
  /** Reviewer feedback for fixer tasks */
  reviewComments?: string | null
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

  return `## Task: ${params.taskTitle}

**Read ${params.repoDir}/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`pm\`
Mode: **TRIAGE**

${params.taskDescription}${imageSection}

---

**Your job:** Triage this issue and either:
1. **Flesh it out** and change role to \`dev\` if it's clear enough
2. **Create clarifying questions** as blocking signals if it needs more info

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

  return `## Task: ${params.taskTitle}

**Read ${params.repoDir}/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`pm\`

${params.taskDescription}

${signalContext}---

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

**When done:** Mark this ticket done:
\`\`\`bash
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "done"}'
\`\`\`

**DO NOT:** Create branches, write code, or create PRs. You are a PM.`
}

/**
 * Build QA role instructions
 */
function buildQaInstructions(params: PromptParams): string {
  return `## Task: ${params.taskTitle}

**Read ${params.repoDir}/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`qa\`

${params.taskDescription}

---

**Your job:** Test this ticket's requirements via browser automation and code review.

## Browser Testing with agent-browser

You have \`agent-browser\` installed globally. Use it for all UI verification.

**Workflow:**
\`\`\`bash
# 1. Open the target page
agent-browser open http://localhost:3002/projects/the-trap/board

# 2. Get accessibility tree to understand UI state
agent-browser snapshot

# 3. Interact with elements (use refs from snapshot, or CSS selectors)
agent-browser click @e5
agent-browser fill @e3 "test input"
agent-browser find role button click --name "Save"

# 4. Verify results
agent-browser get text @e1
agent-browser snapshot
agent-browser screenshot /tmp/qa-evidence.png

# 5. ALWAYS close when done
agent-browser close
\`\`\`

**Key commands:**
- \`agent-browser open <url>\` — navigate to page
- \`agent-browser snapshot\` — get accessibility tree with refs (do this often)
- \`agent-browser click @ref\` / \`agent-browser click "selector"\` — click
- \`agent-browser fill @ref "text"\` / \`agent-browser fill "selector" "text"\` — fill input
- \`agent-browser find role button click --name "Name"\` — semantic find + action
- \`agent-browser get text @ref\` — read element text
- \`agent-browser wait --text "Expected"\` — wait for text to appear
- \`agent-browser wait --load networkidle\` — wait for page to finish loading
- \`agent-browser screenshot /tmp/name.png\` — capture evidence
- \`agent-browser close\` — **MUST call when done**

**Notes:**
- Refs (\`@e5\`) are only valid until the page changes — take a new snapshot after interactions
- The app runs at \`http://localhost:3002\`
- Take screenshots of failures as evidence

## Testing Scope
1. **Browser test** all acceptance criteria in the ticket
2. **Code review** — check the implementation makes sense (\`cat\`, \`rg\` in the repo)
3. **Type check** — \`cd ${params.repoDir} && pnpm typecheck\` (if relevant)
4. **File bug tickets** for any issues found

**When verified (all criteria pass):** Mark done:
\`\`\`bash
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "done"}'
\`\`\`

**If issues found:** File a bug ticket, add a comment, and move back to ready:
\`\`\`bash
# File a bug ticket for each issue
curl -X POST http://localhost:3002/api/tasks -H 'Content-Type: application/json' -d '{
  "project_id": "${params.projectId}",
  "title": "[BUG] <description>",
  "description": "## Summary\\n...\\n## Steps to Reproduce\\n1. ...\\n## Expected\\n...\\n## Actual\\n...\\n## Severity\\nHigh/Medium/Low",
  "status": "ready",
  "priority": "high",
  "role": "dev"
}'

# Comment on the original ticket
curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments -H 'Content-Type: application/json' -d '{"content": "QA failed: <summary of issues found>"}'

# Move back to ready for rework
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "ready"}'
\`\`\`

**CRITICAL: Always run \`agent-browser close\` before finishing.**`
}

/**
 * Build Research role instructions
 */
function buildResearchInstructions(params: PromptParams): string {
  return `## Task: ${params.taskTitle}

**Read ${params.repoDir}/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`research\`

${params.taskDescription}

---

**Your job:** Research this topic and post findings.

Write findings as a comment on the ticket:
\`\`\`bash
curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments -H 'Content-Type: application/json' -d '{"content": "<findings>"}'
\`\`\`

**When done:** Mark this ticket done:
\`\`\`bash
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "done"}'
\`\`\`

**DO NOT:** Create branches or write code unless the ticket explicitly asks for a prototype.`
}

/**
 * Build Reviewer role instructions
 */
function buildReviewerInstructions(params: PromptParams): string {
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

${params.taskDescription}

---

**Your job:** Review the PR for this ticket.

**Review steps:**
1. Check the diff: \`gh pr diff <number>\`
2. Verify types: \`cd ${params.worktreeDir} && pnpm typecheck\`
3. Verify lint: \`cd ${params.worktreeDir} && pnpm lint\`
4. **You do NOT have browser access.** If UI changes need visual verification, note it in your review comment

**If approved:**
\`\`\`bash
gh pr merge <number> --squash --delete-branch
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "done"}'
cd ${params.repoDir} && git worktree remove ${params.worktreeDir} --force 2>/dev/null || true
\`\`\`

**If issues found:** Leave a PR comment, move ticket back to ready:
\`\`\`bash
gh pr comment <number> --body '<specific feedback>'
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "ready"}'
\`\`\``
}

/**
 * Build Dev role instructions (default)
 */
function buildDevInstructions(params: PromptParams): string {
  const branchName = `fix/${params.taskId.slice(0, 8)}`

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

${params.taskDescription}

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
 curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments -H 'Content-Type: application/json' -d '{"content": "Started work. Branch: \`${branchName}\`, worktree: \`${params.worktreeDir}\`"}'
\`\`\`

**After implementation, push and create PR:**
\`\`\`bash
cd ${params.worktreeDir}
git add -A
git commit -m "feat: <description>"
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
curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments -H 'Content-Type: application/json' -d "{\"content\": \"Implementation complete. PR #$PR_NUMBER opened: $PR_TITLE\"}"
\`\`\`

Then update ticket to in_review:
\`\`\`bash
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "in_review"}'
\`\`\`

**If you encounter blockers:**
\`\`\`bash
# Post a comment about any issues during implementation
curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments -H 'Content-Type: application/json' -d '{"content": "Blocker: <description of issue>"}'
\`\`\``
}

/**
 * Build Fixer role instructions
 *
 * Fixers address review feedback on existing PRs. They work in the existing
 * worktree and branch rather than creating a new one.
 */
function buildFixerInstructions(params: PromptParams): string {
  const branchName = params.taskId.slice(0, 8)
  const reviewFeedback = params.reviewComments ?? "Address the review feedback on the PR"

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
Role: \`fixer\`

${params.taskDescription}

---

## Review Feedback to Address

${reviewFeedback}

---

**Your job:** Address the review feedback and update the existing PR.

**Setup (use existing worktree):**
\`\`\`bash
cd ${params.repoDir}

# The worktree should already exist from the original dev work
# Just verify it exists and checkout the branch
cd ${params.worktreeDir}
git status

# If the worktree doesn't exist, recreate it from the PR branch
cd ${params.repoDir}
git worktree add ${params.worktreeDir} origin/fix/${branchName} || git worktree add ${params.worktreeDir} fix/${branchName}
cd ${params.worktreeDir}
\`\`\`

**Make your changes:**
\`\`\`bash
cd ${params.worktreeDir}

# Make changes to address the review feedback
# ... edit files ...

# Verify types and lint pass
pnpm typecheck
pnpm lint
\`\`\`

**Push to the existing PR:**
\`\`\`bash
cd ${params.worktreeDir}
git add -A
git commit -m "fix: address review feedback"
git push
\`\`\`

**Post progress comment and move back to in_review:**
\`\`\`bash
# Post progress comment
curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments -H 'Content-Type: application/json' -d '{"content": "Addressed review feedback and pushed updates to PR"}'

# Move back to in_review for re-review
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "in_review", "role": "dev"}'
\`\`\`

**Key differences from dev role:**
- You do NOT create a new branch or PR — use the existing one
- You do NOT create a new worktree — use the existing one
- Your job is to fix the issues identified in review, not implement new features
- After fixing, the task goes back to in_review for another round of review

**If you encounter blockers:**
\`\`\`bash
# Post a comment about any issues
curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments -H 'Content-Type: application/json' -d '{"content": "Fixer blocker: <description of issue>"}'
\`\`\``
}

// ============================================
// Main Prompt Builder
// ============================================

/**
 * Build a role-specific prompt for a task
 *
 * Combines the role SOUL template with task details and role-specific
 * instructions for how to complete the task.
 */
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
      case "qa":
        return buildQaInstructions(params)
      case "research":
      case "researcher":
        return buildResearchInstructions(params)
      case "reviewer":
        return buildReviewerInstructions(params)
      case "fixer":
        return buildFixerInstructions(params)
      case "dev":
      default:
        return buildDevInstructions(params)
    }
  })()

  return `${params.soulTemplate}

---

${roleInstructions}`
}
