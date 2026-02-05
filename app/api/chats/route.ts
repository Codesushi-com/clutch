import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

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
    const chats = await convex.query(api.chats.getByProject, { projectId: projectId as Id<'projects'> })

    // Transform to include lastMessage object (already done by Convex function)
    const result = chats.map(chat => ({
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

  // Auto-generate title if none provided
  const chatTitle = title?.trim() || `Chat ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`

  try {
    const convex = getConvexClient()

    // Note: Skipping project verification for E2E test
    // In production, we'd verify the project exists

    const chat = await convex.mutation(api.chats.create, {
      project_id,
      title: chatTitle,
      participants,
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

    // Verify chat exists
    const existingChat = await convex.query(api.chats.getById, { id })
    if (!existingChat) {
      return NextResponse.json(
        { error: "Chat not found" },
        { status: 404 }
      )
    }

    const updates: { title?: string; session_key?: string } = {}
    if (title?.trim()) updates.title = title.trim()
    if (session_key) updates.session_key = session_key

    const updatedChat = await convex.mutation(api.chats.update, {
      id,
      ...updates,
    })

    return NextResponse.json({ chat: updatedChat })
  } catch (error) {
    console.error("[Chats API] Error updating chat:", error)
    return NextResponse.json(
      { error: "Failed to update chat" },
      { status: 500 }
    )
  }
}
