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
  
  if (!title?.trim() && session_key === undefined) {
    return NextResponse.json(
      { error: "No fields to update" },
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

// DELETE /api/chats/[id] — Delete chat
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
  try {
    const convex = getConvexClient()
    const success = await convex.mutation(api.chats.deleteChat, { id })

    if (!success) {
      return NextResponse.json(
        { error: "Chat not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Chats API] Error deleting chat:", error)
    return NextResponse.json(
      { error: "Failed to delete chat" },
      { status: 500 }
    )
  }
}
