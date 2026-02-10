import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import { getOpenClawClient } from "@/lib/openclaw/client"
import { execFileSync } from "child_process"
import fs from "fs"

type RouteContext = {
  params: Promise<{ id: string }>
}

interface AbortResult {
  success: boolean
  sessionKilled: boolean
  worktreeRemoved: boolean
  branchDeleted: boolean
  prClosed?: number
  errors: string[]
}

// POST /api/tasks/:id/abort — Force-stop and discard an in-progress task
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params
  const body = await request.json().catch(() => ({}))
  const triggeredBy = body.triggeredBy || "user"

  const result: AbortResult = {
    success: false,
    sessionKilled: false,
    worktreeRemoved: false,
    branchDeleted: false,
    errors: [],
  }

  try {
    const convex = getConvexClient()

    // Get task
    const taskResult = await convex.query(api.tasks.getById, { id })
    if (!taskResult) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const { task } = taskResult

    // Validate status is in_progress
    if (task.status !== "in_progress") {
      return NextResponse.json(
        { error: `Task is not in_progress (current status: ${task.status})` },
        { status: 400 }
      )
    }

    // Get project for worktree path
    const project = await convex.query(api.projects.getById, { id: task.project_id })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    if (!project.local_path) {
      return NextResponse.json(
        { error: "Project has no local_path configured" },
        { status: 400 }
      )
    }

    // 1. Kill agent session if one exists
    if (task.agent_session_key) {
      try {
        const client = getOpenClawClient()
        if (client.getStatus() === "connected") {
          await client.rpc("sessions.delete", {
            key: task.agent_session_key,
            deleteTranscript: false, // Keep transcript for debugging
          })
          result.sessionKilled = true
        } else {
          result.errors.push("OpenClaw client not connected - session may still be running")
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        result.errors.push(`Failed to kill session: ${msg}`)
        // Continue with cleanup even if session kill fails
      }
    }

    // 2. Clean up git artifacts
    const taskIdPrefix = task.id.slice(0, 8)
    const repoDir = project.local_path
    const worktreesBase = `${repoDir}-worktrees`
    const worktreeDir = `${worktreesBase}/fix/${taskIdPrefix}`
    const branchName = task.branch || `fix/${taskIdPrefix}`

    // Remove worktree
    try {
      if (fs.existsSync(worktreeDir)) {
        execFileSync("git", ["-C", repoDir, "worktree", "remove", "--force", worktreeDir], {
          encoding: "utf-8",
          timeout: 30000,
        })
        result.worktreeRemoved = true
      } else {
        result.worktreeRemoved = true // Already gone, that's fine
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      result.errors.push(`Failed to remove worktree: ${msg}`)
    }

    // Delete branch (local)
    try {
      // Check if branch exists before trying to delete
      const branches = execFileSync("git", ["-C", repoDir, "branch", "--list", branchName], {
        encoding: "utf-8",
      })
      if (branches.trim()) {
        execFileSync("git", ["-C", repoDir, "branch", "-D", branchName], {
          encoding: "utf-8",
          timeout: 30000,
        })
        result.branchDeleted = true
      } else {
        result.branchDeleted = true // Already gone, that's fine
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      result.errors.push(`Failed to delete local branch: ${msg}`)
    }

    // Delete branch (remote)
    try {
      execFileSync("git", ["-C", repoDir, "push", "origin", "--delete", branchName], {
        encoding: "utf-8",
        timeout: 30000,
      })
    } catch (error) {
      // Remote branch may not exist, that's fine
      // Only log as error if it's not a "remote ref does not exist" error
      const msg = error instanceof Error ? error.message : String(error)
      if (!msg.includes("remote ref does not exist") && !msg.includes("couldn't find remote ref")) {
        result.errors.push(`Failed to delete remote branch: ${msg}`)
      }
    }

    // Close PR if one exists
    if (task.pr_number) {
      try {
        execFileSync("gh", ["pr", "close", String(task.pr_number), "--delete-branch=false"], {
          encoding: "utf-8",
          cwd: repoDir,
          timeout: 30000,
          env: {
            ...process.env,
            // Use the ada-bot GitHub app token if available
            GH_TOKEN: process.env.GITHUB_APP_TOKEN || process.env.GH_TOKEN,
          },
        })
        result.prClosed = task.pr_number
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        // PR may already be closed/merged, that's fine
        if (!msg.includes("already closed") && !msg.includes("already merged")) {
          result.errors.push(`Failed to close PR #${task.pr_number}: ${msg}`)
        } else {
          result.prClosed = task.pr_number // Mark as closed even if it was already done
        }
      }
    }

    // 3. Move task to done with resolution "discarded"
    await convex.mutation(api.tasks.move, {
      id,
      status: "done",
      resolution: "discarded",
      reason: "Task aborted - work discarded and resources cleaned up"
    })

    // 4. Log task event
    await convex.mutation(api.task_events.logDiscarded, {
      taskId: id,
      reason: `Task force-stopped and work discarded by ${triggeredBy}`,
      actor: triggeredBy,
      agentSessionKey: task.agent_session_key || undefined,
      worktreeRemoved: result.worktreeRemoved,
      branchDeleted: result.branchDeleted,
      prClosed: result.prClosed,
    })

    // 5. Add comment
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"}/api/tasks/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `Task force-stopped and work discarded by ${triggeredBy}.` +
          (result.sessionKilled ? " Agent session terminated." : "") +
          (result.worktreeRemoved ? " Worktree removed." : "") +
          (result.branchDeleted ? " Branch deleted." : "") +
          (result.prClosed ? ` PR #${result.prClosed} closed.` : "") +
          (result.errors.length > 0 ? ` Errors: ${result.errors.join("; ")}` : ""),
        author: triggeredBy,
        author_type: "human",
      }),
    })

    result.success = true

    return NextResponse.json({
      success: true,
      result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[Abort API] Error aborting task:", error)
    return NextResponse.json(
      { error: "Failed to abort task", details: message },
      { status: 500 }
    )
  }
}