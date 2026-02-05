import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/server"
import type { Task, Project, Comment } from "@/lib/db/types"
import { getAgent } from "@/lib/agents"
import { buildProjectContext, formatProjectContext } from "@/lib/project-context"

type RouteContext = {
  params: Promise<{ id: string }>
}

type TaskId = Id<"tasks">
type ProjectId = Id<"projects">

// Build context for spawning an agent session (using Convex data)
async function buildTaskContextFromConvex(
  task: Task,
  project: Project,
  agentId: string
): Promise<string> {
  const agent = getAgent(agentId)
  const agentName = agent?.name || agentId

  // Get recent comments on this task via Convex
  const commentsResult = await convexServerClient.query(api.tasks.getById, {
    id: task.id as TaskId,
  })
  const comments = commentsResult?.comments || []

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
    context += `\n## Project Context
Project: ${project.name}
${project.description ? `\n${project.description}` : ""}
`
  }

  // Add instructions based on agent role
  context += `\n## Instructions
You are **${agentName}** working on this task.

1. **Work in the project directory**: \`cd ${project.local_path || "."}\`
2. Complete the task as described
3. If you need clarification, post a comment with type "request_input"
4. When done, post a comment with type "completion" and summary
5. For code changes, create a PR and include the link in your completion comment
6. Do NOT merge PRs - leave them open for review

Work systematically. Start by understanding the task, then plan your approach, then execute.
`

  return context
}

function buildTaskLabel(task: Task): string {
  return `trap-task-${task.id.slice(0, 8)}`
}

// POST /api/tasks/:id/dispatch — Request dispatch to agent
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params
  const body = await request.json().catch(() => ({}))

  try {
    // Get task via Convex
    const taskResult = await convexServerClient.query(api.tasks.getById, {
      id: id as TaskId,
    })

    if (!taskResult) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const task = taskResult.task

    // Check if already dispatched
    if (
      task.dispatch_status === "pending" ||
      task.dispatch_status === "spawning" ||
      task.dispatch_status === "active"
    ) {
      return NextResponse.json(
        { error: "Task already has active dispatch", dispatch_status: task.dispatch_status },
        { status: 409 }
      )
    }

    // Determine agent - from body, task assignee, or default
    const agentId = body.agentId || task.assignee
    if (!agentId) {
      return NextResponse.json(
        { error: "No agent specified. Set task assignee or provide agentId." },
        { status: 400 }
      )
    }

    // Verify agent exists
    const agent = getAgent(agentId)
    if (!agent) {
      return NextResponse.json(
        { error: `Unknown agent: ${agentId}` },
        { status: 400 }
      )
    }

    // Get project via Convex
    const project = await convexServerClient.query(api.projects.getById, {
      id: task.project_id as ProjectId,
    })

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    // Build context for the agent
    const taskContext = await buildTaskContextFromConvex(task, project, agentId)
    const taskLabel = buildTaskLabel(task)

    const now = Date.now()
    const requestedBy = body.requestedBy || "api"

    // Update task with dispatch request via Convex
    await convexServerClient.mutation(api.tasks.update, {
      id: id as TaskId,
      assignee: agentId,
      session_id: null, // Will be set when session is actually spawned
    })

    // Note: dispatch_status, dispatch_requested_at, dispatch_requested_by are not in the
    // current update mutation args - we may need to add them or handle dispatch differently

    return NextResponse.json({
      success: true,
      dispatch: {
        taskId: task.id,
        agentId,
        status: task.dispatch_status || "pending",
        label: taskLabel,
        requestedAt: now,
        requestedBy,
      },
      context: taskContext,
    })
  } catch (error) {
    console.error("Error dispatching task:", error)
    return NextResponse.json(
      { error: "Failed to dispatch task" },
      { status: 500 }
    )
  }
}

// GET /api/tasks/:id/dispatch — Get dispatch status and context preview
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params

  try {
    const taskResult = await convexServerClient.query(api.tasks.getById, {
      id: id as TaskId,
    })

    if (!taskResult) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const task = taskResult.task

    const project = await convexServerClient.query(api.projects.getById, {
      id: task.project_id as ProjectId,
    })

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const agentId = task.assignee
    const agent = agentId ? getAgent(agentId) : null

    // Build context preview (only if agent is assigned)
    const contextPreview = agentId
      ? await buildTaskContextFromConvex(task, project, agentId)
      : null

    return NextResponse.json({
      taskId: task.id,
      assignee: agentId,
      agent: agent ? { id: agent.id, name: agent.name, role: agent.role } : null,
      dispatch_status: task.dispatch_status,
      dispatch_requested_at: task.dispatch_requested_at,
      dispatch_requested_by: task.dispatch_requested_by,
      session_id: task.session_id,
      contextPreview,
    })
  } catch (error) {
    console.error("Error fetching dispatch status:", error)
    return NextResponse.json(
      { error: "Failed to fetch dispatch status" },
      { status: 500 }
    )
  }
}
