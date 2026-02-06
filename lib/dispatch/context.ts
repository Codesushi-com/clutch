import type { Task, Project, Comment } from "@/lib/types"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import { getAgent } from "@/lib/agents"
import { buildProjectContext, formatProjectContext } from "@/lib/project-context"

/**
 * Build context for spawning an agent session
 *
 * This cascades project context (working directory, GitHub repo, key files like
 * AGENTS.md, README.md) into the task context that agents receive.
 */
export async function buildTaskContext(task: Task, project: Project, agentId: string): Promise<string> {
  const agent = getAgent(agentId)
  const agentName = agent?.name || agentId

  // Get recent comments on this task using Convex
  const convex = getConvexClient()
  const comments = await convex.query(api.comments.getByTask, {
    taskId: task.id,
    limit: 10
  })

  const priorityLabels: Record<string, string> = {
    low: "Low",
    medium: "Medium",
    high: "High",
    urgent: "🚨 Urgent",
  }

  // Build the project context from local files (AGENTS.md, README.md, etc.)
  const projectContext = buildProjectContext(project)
  const formattedProjectContext = formatProjectContext(projectContext)

  let context = `# Task Assignment

## Task
- **ID**: ${task.id.slice(0, 8)}
- **Title**: ${task.title}
- **Priority**: ${priorityLabels[task.priority] || task.priority}
- **Status**: ${task.status}
- **Project**: ${project.name}
${project.github_repo ? `- **Repository**: ${project.github_repo}` : project.repo_url ? `- **Repository**: ${project.repo_url}` : ""}
${project.local_path ? `- **Working Directory**: \`${project.local_path}\`` : ""}

## Description
${task.description || "_No description provided_"}
`

  // Add comments if any
  if (comments.length > 0) {
    context += `\n## Previous Comments\n`
    // Show oldest first for chronological reading
    ;[...comments].reverse().forEach((comment: Comment) => {
      const authorLabel = comment.author_type === "human" ? "👤" : "🤖"
      const time = new Date(comment.created_at).toISOString().split("T")[0]
      context += `\n**${authorLabel} ${comment.author}** (${time}):\n${comment.content}\n`
    })
  }

  // Add cascaded project context (includes key files like AGENTS.md, README.md)
  if (projectContext.files.length > 0 || projectContext.workingDirectory) {
    context += `\n---\n\n${formattedProjectContext}\n`
  } else {
    // Fallback to basic project info if no files found
    context += `\n## Project Context\nProject: ${project.name}\n${project.description ? `\n${project.description}` : ""}\n`
  }

  // Add instructions based on agent role
  context += `\n## Instructions\nYou are **${agentName}** working on this task.\n\n1. **Work in the project directory**: \`cd ${project.local_path || "."}\`\n2. Complete the task as described\n3. If you need clarification, post a comment with type "request_input"\n4. When done, post a comment with type "completion" and summary\n5. For code changes, create a PR and include the link in your completion comment\n6. Do NOT merge PRs - leave them open for review\n\nWork systematically. Start by understanding the task, then plan your approach, then execute.\n`

  return context
}

/**
 * Build a task label for session tracking
 */
export function buildTaskLabel(task: Task): string {
  return `trap-task-${task.id.slice(0, 8)}`
}
