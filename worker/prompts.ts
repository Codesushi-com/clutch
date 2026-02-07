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
  /** The role of the agent (dev, pm, qa, research, reviewer) */
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
  /** Optional image URLs for the PM to analyze */
  imageUrls?: string[]
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

**Read /home/dan/src/trap/AGENTS.md first.**

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
 * Build QA role instructions
 */
function buildQaInstructions(params: PromptParams): string {
  return `## Task: ${params.taskTitle}

**Read /home/dan/src/trap/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`qa\`

${params.taskDescription}

---

**Your job:** Verify this ticket's requirements are met via code review and testing.

**NOTE:** You do NOT have browser access. Verify via code review, type checking, and lint. If manual browser QA is needed, leave the ticket in \`in_review\` with a comment noting what needs visual verification.

**When verified:** Mark done:
\`\`\`bash
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "done"}'
\`\`\`

**If issues found:** Add a comment and move back to ready:
\`\`\`bash
curl -X POST http://localhost:3002/api/tasks/${params.taskId}/comments -H 'Content-Type: application/json' -d '{"content": "<findings>"}'
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "ready"}'
\`\`\``
}

/**
 * Build Research role instructions
 */
function buildResearchInstructions(params: PromptParams): string {
  return `## Task: ${params.taskTitle}

**Read /home/dan/src/trap/AGENTS.md first.**

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

**Read /home/dan/src/trap/AGENTS.md first** (use: \`exec(command="cat /home/dan/src/trap/AGENTS.md")\`).

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
cd /home/dan/src/trap && git worktree remove ${params.worktreeDir} --force 2>/dev/null || true
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

**Read /home/dan/src/trap/AGENTS.md first** (use: \`exec(command="cat /home/dan/src/trap/AGENTS.md")\`).

## Tool Usage (CRITICAL)
- **\`read\` tool REQUIRES a \`path\` parameter.** Never call read() with no arguments.
- **Use \`exec\` with \`cat\` to read files:** \`exec(command="cat /path/to/file.ts")\`
- **Use \`rg\` to search code:** \`exec(command="rg 'pattern' ${params.worktreeDir}/app -t ts")\` (note: \`-t ts\` covers both .ts AND .tsx — do NOT use \`-t tsx\`, it doesn't exist)
- **Use \`fd\` to find files:** \`exec(command="fd '\\.tsx$' ${params.worktreeDir}/app")\`
- **Quote paths with brackets:** Next.js uses \`[slug]\` dirs — always quote these in shell: \`cat '${params.worktreeDir}/app/projects/[slug]/page.tsx'\`
- **All work happens in your worktree:** \`${params.worktreeDir}\` (NOT in /home/dan/src/trap)

Ticket ID: \`${params.taskId}\`
Role: \`dev\`

${params.taskDescription}

---

**Setup worktree and record branch:**
\`\`\`bash
cd /home/dan/src/trap
git fetch origin main
git worktree add ${params.worktreeDir} origin/main -b ${branchName}
cd ${params.worktreeDir}

# Record the branch name on the task
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"branch": "${branchName}"}'
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

# Record the PR number on the task
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d "{\"pr_number\": $PR_NUMBER}"
\`\`\`

Then update ticket to in_review:
\`\`\`bash
curl -X PATCH http://localhost:3002/api/tasks/${params.taskId} -H 'Content-Type: application/json' -d '{"status": "in_review"}'
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
      case "pm":
        return buildPmInstructions(params)
      case "qa":
        return buildQaInstructions(params)
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
