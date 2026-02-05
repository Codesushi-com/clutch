import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/server"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/chats/[id] — Get single chat by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  try {
    const chat = await convexServerClient.query(api.chats.getById, {
      id: id as Id<"chats">,
    })

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

// DELETE /api/chats/[id] — Delete chat
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  try {
    await convexServerClient.mutation(api.chats.deleteChat, {
      id: id as Id<"chats">,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Chats API] Error deleting chat:", error)

    if (error instanceof Error && error.message.includes("Chat not found")) {
      return NextResponse.json(
        { error: "Chat not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: "Failed to delete chat" },
      { status: 500 }
    )
  }
}
