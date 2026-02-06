import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/chats/[id]/typing — Set or clear typing indicator
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const body = await request.json()

  const { typing, author = "ada", state = "thinking" } = body

  if (typeof typing !== "boolean") {
    return NextResponse.json(
      { error: "typing (boolean) is required" },
      { status: 400 }
    )
  }

  const convex = getConvexClient()

  // Verify chat exists
  const chat = await convex.query(api.chats.getById, { id })
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found" },
      { status: 404 }
    )
  }

  if (typing) {
    const validState = state === "typing" ? "typing" as const : "thinking" as const
    await convex.mutation(api.chats.setTyping, {
      chat_id: id,
      author,
      state: validState,
    })
  } else {
    await convex.mutation(api.chats.clearTyping, {
      chat_id: id,
      author,
    })
  }

  return NextResponse.json({ ok: true })
}
