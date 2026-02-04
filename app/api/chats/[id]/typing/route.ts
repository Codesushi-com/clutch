import { NextRequest, NextResponse } from "next/server"
import { broadcastToChat } from "@/lib/sse/connections"

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/chats/[id]/typing — Broadcast typing indicator
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const body = await request.json()
  
  const { typing = true, author = "ada" } = body
  
  broadcastToChat(id, {
    type: "typing",
    data: { chatId: id, author, typing },
  })

  return NextResponse.json({ ok: true })
}
