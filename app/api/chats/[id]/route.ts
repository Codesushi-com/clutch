import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/chats/[id] — Get single chat by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  try {
    const convex = getConvexClient()
    const chat = await convex.query(api.chats.getById, { id })

    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ chat })
  } catch (error) {
    console.error("[Chats API] Error fetching chat:", error)
    return NextResponse.json(
      { error: "Failed to fetch chat" },
      { status: 500 }
    )
  }
}

// PATCH /api/chats/[id] — Update chat
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const body = await request.json()

  const { title, session_key } = body

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
    if (session_key !== undefined) updates.session_key = session_key

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      )
    }

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

// DELETE /api/chats/[id] — Delete chat
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

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

    // Delete the chat (cascade will delete messages)
    await convex.mutation(api.chats.deleteChat, { id })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Chats API] Error deleting chat:", error)
    return NextResponse.json(
      { error: "Failed to delete chat" },
      { status: 500 }
    )
  }
}