import { db } from "@/lib/db"
import type { Task, Project, Comment } from "@/lib/db/types"
import { getAgent } from "@/lib/agents"

/**
 * Build context for spawning an agent session
 */
export function buildTaskContext(task: Task, project: Project, agentId: string): string {
  const agent = getAgent(agentId)
  const agentName = agent?.name || agentId
  
  // Get recent comments on this task
  const comments = db.prepare(`
    SELECT * FROM comments 
    WHERE task_id = ? 
    ORDER BY created_at DESC 
    LIMIT 10
  `).all(task.id) as Comment[]
  
  const priorityLabels: Record<string, string> = {
    low: "Low",
    medium: "Medium",
    high: "High",
    urgent: "🚨 Urgent",
  }
  
  let context = `# Task Assignment

## Task
- **ID**: ${task.id.slice(0, 8)}
- **Title**: ${task.title}
- **Priority**: ${priorityLabels[task.priority] || task.priority}
- **Status**: ${task.status}
- **Project**: ${project.name}
${project.repo_url ? `- **Repository**: ${project.repo_url}` : ""}

## Description
${task.description || "_No description provided_"}
`

  // Add comments if any
  if (comments.length > 0) {
    context += `\n## Previous Comments\n`
    // Show oldest first for chronological reading
    comments.reverse().forEach((comment) => {
      const authorLabel = comment.author_type === "human" ? "👤" : "🤖"
      const time = new Date(comment.created_at).toISOString().split("T")[0]
      context += `\n**${authorLabel} ${comment.author}** (${time}):\n${comment.content}\n`
    })
  }

  // Add project context placeholder
  // TODO: Load actual project context files (STANDARDS.md, etc.)
  context += `\n## Project Context
Project: ${project.name}
${project.description ? `\n${project.description}` : ""}
`

  // Add instructions based on agent role
  context += `\n## Instructions
You are **${agentName}** working on this task.

1. Complete the task as described
2. If you need clarification, post a comment with type "request_input"
3. When done, post a comment with type "completion" and summary
4. For code changes, create a PR and include the link in your completion comment
5. Do NOT merge PRs - leave them open for review

Work systematically. Start by understanding the task, then plan your approach, then execute.
`

  return context
}

/**
 * Build a task label for session tracking
 */
export function buildTaskLabel(task: Task): string {
  return `trap-task-${task.id.slice(0, 8)}`
}
