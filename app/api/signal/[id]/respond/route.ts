import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { Signal } from "@/lib/db/types"

// POST /api/signal/[id]/respond — Respond to signal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  
  const { response } = body
  
  if (!response || typeof response !== "string") {
    return NextResponse.json(
      { error: "response is required and must be a string" },
      { status: 400 }
    )
  }
  
  // Check if signal exists
  const signal = db.prepare("SELECT * FROM signals WHERE id = ?").get(id) as Signal | undefined
  
  if (!signal) {
    return NextResponse.json(
      { error: "Signal not found" },
      { status: 404 }
    )
  }
  
  // Check if already responded
  if (signal.responded_at !== null) {
    return NextResponse.json(
      { error: "Signal has already been responded to" },
      { status: 409 }
    )
  }
  
  const now = Date.now()
  
  // Update the signal with response
  db.prepare(`
    UPDATE signals 
    SET response = ?, responded_at = ?
    WHERE id = ?
  `).run(response, now, id)
  
  // TODO: Integrate with OpenClaw sessions_send to notify the agent
  // This will be wired later when OpenClaw session integration is ready
  
  // Get the updated signal
  const updatedSignal = db.prepare("SELECT * FROM signals WHERE id = ?").get(id) as Signal
  
  return NextResponse.json({
    success: true,
    signal: updatedSignal,
    // TODO: Add session notification status once OpenClaw integration is ready
  })
}