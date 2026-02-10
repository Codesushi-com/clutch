import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// POST /api/chats/messages/recover — Bulk recovery of stuck messages
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { age_threshold_minutes = 5, action = "mark_failed" } = body
  
  if (!["mark_failed", "retry"].includes(action)) {
    return NextResponse.json(
      { error: "action must be 'mark_failed' or 'retry'" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()

    // Get stuck messages
    const stuckMessages = await convex.query(api.chats.getStuckMessages, {
      age_threshold_ms: age_threshold_minutes * 60 * 1000,
      limit: 100, // Safety limit for bulk operations
    })

    if (stuckMessages.length === 0) {
      return NextResponse.json({
        success: true,
        action,
        processed: 0,
        message: "No stuck messages found"
      })
    }

    let processed = 0
    let failed = 0
    const results = []

    if (action === "mark_failed") {
      // Bulk mark as failed
      const messageIds = stuckMessages.map(m => m.id)
      const failureReason = `Gateway restart/timeout (age: ${age_threshold_minutes}+ minutes)`

      const result = await convex.mutation(api.chats.markMessagesAsFailed, {
        message_ids: messageIds,
        failure_reason: failureReason,
      })

      processed = result.updated_count
      failed = result.failed_ids.length

      // Add system messages to affected chats
      const chatIds = new Set(stuckMessages.map(m => m.chat_id))
      for (const chatId of chatIds) {
        const affectedCount = stuckMessages.filter(m => m.chat_id === chatId).length
        const systemMessage = `⚠️ ${affectedCount} message${affectedCount > 1 ? 's' : ''} failed due to gateway restart/timeout. You can retry them or send new messages.`
        
        try {
          await convex.mutation(api.chats.addSystemMessage, {
            chat_id: chatId,
            content: systemMessage,
          })
        } catch (error) {
          console.warn(`Failed to add system message to chat ${chatId}:`, error)
        }
      }

      results.push({
        action: "marked_failed",
        processed,
        failed,
        system_messages_added: chatIds.size
      })

    } else if (action === "retry") {
      // Individual retries (safer than bulk)
      for (const message of stuckMessages) {
        try {
          await convex.mutation(api.chats.retryMessage, {
            message_id: message.id,
          })
          processed++
        } catch (error) {
          console.warn(`Failed to retry message ${message.id}:`, error)
          failed++
        }
      }

      results.push({
        action: "retried",
        processed,
        failed
      })
    }

    return NextResponse.json({
      success: true,
      action,
      total_found: stuckMessages.length,
      processed,
      failed,
      results,
      age_threshold_minutes
    })

  } catch (error) {
    console.error("[Message Recovery API] Error during bulk recovery:", error)
    return NextResponse.json(
      { error: "Failed to recover messages" },
      { status: 500 }
    )
  }
}