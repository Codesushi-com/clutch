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
}

// ============================================
// Role-Specific Instructions
// ============================================

/**
 * Build PM role instructions
 */
function buildPmInstructions(params: PromptParams): string {
  return `## Task: ${params.taskTitle}

**Read /home/dan/src/trap/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`pm\`

${params.taskDescription}

---

**Your job:** Analyze this ticket and break it down into actionable sub-tickets.

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
  "tags": "[\\"tag1\\", \"tag2\\"]"
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

**Read /home/dan/src/trap/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`qa\`

${params.taskDescription}

---

**Your job:** Verify this ticket's requirements are met via browser QA.

Use the managed browser (\`profile=openclaw\`) to navigate to http://192.168.7.200:3002 and verify functionality.

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

**Read /home/dan/src/trap/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`reviewer\`

${params.taskDescription}

---

**Your job:** Review the PR for this ticket.

**Review steps:**
1. Check the diff: \`gh pr diff <number>\`
2. Verify types: \`cd ${params.worktreeDir} && pnpm typecheck\`
3. Verify lint: \`cd ${params.worktreeDir} && pnpm lint\`
4. Browser QA if UI changes (use managed browser, \`profile=openclaw\`, navigate to http://192.168.7.200:3002)

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

**Read /home/dan/src/trap/AGENTS.md first.**

Ticket ID: \`${params.taskId}\`
Role: \`dev\`

${params.taskDescription}

---

**Setup worktree:**
\`\`\`bash
cd /home/dan/src/trap
git fetch origin main
git worktree add ${params.worktreeDir} origin/main -b ${branchName}
cd ${params.worktreeDir}
\`\`\`

**After implementation, push and create PR:**
\`\`\`bash
cd ${params.worktreeDir}
git add -A
git commit -m "feat: <description>"
git push -u origin ${branchName}
gh pr create --title "<title>" --body "Ticket: ${params.taskId}"
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
