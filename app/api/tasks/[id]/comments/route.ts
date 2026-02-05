import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/server"

type RouteParams = { params: Promise<{ id: string }> }

type TaskId = Id<"tasks">

// GET /api/tasks/[id]/comments — List comments for task
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
  try {
    const comments = await convexServerClient.query(api.comments.getByTask, {
      taskId: id as TaskId,
    })

    return NextResponse.json({ comments })
  } catch (error) {
    console.error("Error fetching comments:", error)
    
    if (error instanceof Error && error.message.includes("Task not found")) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }
    
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    )
  }
}

// POST /api/tasks/[id]/comments — Add comment
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const body = await request.json()
  
  const { 
    content, 
    author = "dan",
    author_type = "human",
    type = "message",
  } = body
  
  if (!content) {
    return NextResponse.json(
      { error: "Content is required" },
      { status: 400 }
    )
  }

  try {
    const comment = await convexServerClient.mutation(api.comments.create, {
      task_id: id as TaskId,
      content,
      author,
      author_type,
      type,
    })

    return NextResponse.json({ comment }, { status: 201 })
  } catch (error) {
    console.error("Error creating comment:", error)
    
    if (error instanceof Error && error.message.includes("Task not found")) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }
    
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    )
  }
}
