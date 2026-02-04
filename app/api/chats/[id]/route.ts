import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { Chat } from "@/lib/db/types"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/chats/[id] — Get single chat by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
  const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(id) as Chat | undefined
  
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found" },
      { status: 404 }
    )
  }

  return NextResponse.json({ chat })
}

// PATCH /api/chats/[id] — Update chat
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const body = await request.json()
  
  const { title, session_key } = body
  
  // Verify chat exists
  const chat = db.prepare("SELECT id FROM chats WHERE id = ?").get(id)
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found" },
      { status: 404 }
    )
  }

  const now = Date.now()
  
  // Build dynamic update query based on provided fields
  const updateFields = []
  const values = []
  
  if (title?.trim()) {
    updateFields.push("title = ?")
    values.push(title.trim())
  }
  
  if (session_key !== undefined) {
    updateFields.push("session_key = ?")
    values.push(session_key)
  }
  
  if (updateFields.length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    )
  }
  
  updateFields.push("updated_at = ?")
  values.push(now)
  values.push(id) // for WHERE clause
  
  db.prepare(`
    UPDATE chats 
    SET ${updateFields.join(", ")}
    WHERE id = ?
  `).run(...values)

  // Fetch the updated chat
  const updatedChat = db.prepare("SELECT * FROM chats WHERE id = ?").get(id) as Chat

  return NextResponse.json({ chat: updatedChat })
}

// DELETE /api/chats/[id] — Delete chat
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
  // Verify chat exists
  const chat = db.prepare("SELECT id FROM chats WHERE id = ?").get(id)
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found" },
      { status: 404 }
    )
  }

  // Delete the chat (cascade will delete messages)
  db.prepare("DELETE FROM chats WHERE id = ?").run(id)

  return NextResponse.json({ success: true })
}