import { NextRequest, NextResponse } from "next/server"

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/chats/[id]/typing — No-op endpoint
// Previously broadcast typing indicators via SSE, now handled by Convex reactivity
// Kept for backward compatibility with trap-channel plugin
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const body = await request.json()
  
  const { typing = true, author = "ada" } = body
  
  // Typing indicators now handled by Convex real-time subscriptions
  // This endpoint remains for API compatibility
  console.log(`[Typing] Chat ${id}: ${author} is ${typing ? 'typing' : 'not typing'}`)

  return NextResponse.json({ ok: true })
}
