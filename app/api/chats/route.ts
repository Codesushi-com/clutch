import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

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
    const convex = getConvexClient()
    const chats = await convex.query(api.chats.getByProject, { projectId })

    // Transform to include lastMessage object (already included from Convex)
    const result = chats.map((chat: { lastMessage?: { content: string; author: string; created_at: number } | null }) => ({
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
    const convex = getConvexClient()

    // Auto-generate title if none provided
    const chatTitle = title?.trim() || `Chat ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`

    const chat = await convex.mutation(api.chats.create, {
      project_id,
      title: chatTitle,
      participants: JSON.stringify(participants),
    })

    return NextResponse.json({ chat }, { status: 201 })
  } catch (error) {
    console.error("[Chats API] Error creating chat:", error)
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
    const convex = getConvexClient()

    const chat = await convex.mutation(api.chats.update, {
      id,
      ...(title?.trim() && { title: title.trim() }),
      ...(session_key !== undefined && { session_key }),
    })

    return NextResponse.json({ chat })
  } catch (error) {
    console.error("[Chats API] Error updating chat:", error)
    const message = error instanceof Error ? error.message : "Failed to update chat"
    if (message.includes("not found")) {
      return NextResponse.json(
        { error: "Chat not found" },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
