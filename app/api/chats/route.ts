import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/server"

// GET /api/chats?projectId=xxx — List chats for project
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get("projectId")

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 }
    )
  }

  try {
    const chats = await convexServerClient.query(api.chats.getByProject, {
      projectId: projectId as Id<"projects">,
    })

    // Transform to match expected format
    const result = chats.map((chat: (typeof chats)[number]) => ({
      ...chat,
      lastMessage: chat.lastMessage || null,
    }))

    return NextResponse.json({ chats: result })
  } catch (error) {
    console.error("[Chats API] Error fetching chats:", error)
    return NextResponse.json(
      { error: "Failed to fetch chats" },
      { status: 500 }
    )
  }
}

// POST /api/chats — Create new chat
export async function POST(request: NextRequest) {
  const body = await request.json()

  const { project_id, title, participants = ["ada"] } = body

  if (!project_id) {
    return NextResponse.json(
      { error: "project_id is required" },
      { status: 400 }
    )
  }

  try {
    const chat = await convexServerClient.mutation(api.chats.create, {
      project_id: project_id as Id<"projects">,
      title,
      participants,
    })

    return NextResponse.json({ chat }, { status: 201 })
  } catch (error) {
    console.error("[Chats API] Error creating chat:", error)
    
    if (error instanceof Error && error.message.includes("Project not found")) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      )
    }
    
    return NextResponse.json(
      { error: "Failed to create chat" },
      { status: 500 }
    )
  }
}

// PATCH /api/chats — Update chat (supports title and session_key)
export async function PATCH(request: NextRequest) {
  const body = await request.json()

  const { id, title, session_key } = body

  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 }
    )
  }

  if (!title?.trim() && !session_key) {
    return NextResponse.json(
      { error: "title or session_key is required" },
      { status: 400 }
    )
  }

  try {
    const chat = await convexServerClient.mutation(api.chats.update, {
      id: id as Id<"chats">,
      title: title?.trim(),
      session_key,
    })

    return NextResponse.json({ chat })
  } catch (error) {
    console.error("[Chats API] Error updating chat:", error)
    
    if (error instanceof Error && error.message.includes("Chat not found")) {
      return NextResponse.json(
        { error: "Chat not found" },
        { status: 404 }
      )
    }
    
    return NextResponse.json(
      { error: "Failed to update chat" },
      { status: 500 }
    )
  }
}
