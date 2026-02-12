/**
 * Chat Bridge Process
 *
 * Standalone process that connects to the OpenClaw gateway via WebSocket
 * and syncs chat events (agent messages) to Convex.
 *
 * Run separately from Next.js to avoid blocking the event loop:
 *   npx tsx worker/chat-bridge.ts
 */

import { ConvexHttpClient } from "convex/browser"
import { api } from "../convex/_generated/api"
import { initializeOpenClawClient } from "../lib/openclaw/client"
import { processMessageContent } from "./image-processor"

const convexUrl = process.env.CONVEX_URL ?? "http://127.0.0.1:3210"

async function main() {
  console.log("[ChatBridge] Starting...")

  const convex = new ConvexHttpClient(convexUrl)

  // Verify Convex connection
  try {
    await convex.query(api.projects.getAll, {})
    console.log(`[ChatBridge] Connected to Convex at ${convexUrl}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[ChatBridge] Failed to connect to Convex: ${message}`)
    process.exit(1)
  }

  // Initialize OpenClaw WebSocket client
  const client = initializeOpenClawClient()

  client.onChatEvent(async (event) => {
    try {
      // Find the chat ID for this session
      const chat = await convex.query(api.chats.findBySessionKey, {
        sessionKey: event.sessionKey,
      })

      if (!chat) {
        // Not an OpenClutch chat session, ignore
        return
      }

      const chatId = chat.id

      switch (event.type) {
        case "chat.message":
          if (event.message) {
            // Process message content (extract text and convert images to markdown)
            const content = await processMessageContent(event.message.content)

            // Check for duplicate via run_id
            if (event.runId) {
              const existing = await convex.query(api.chats.getMessageByRunId, {
                runId: event.runId,
              })
              if (existing) {
                return
              }
            }

            // Save message to Convex
            if (content.trim()) {
              const author =
                event.message.role === "assistant"
                  ? "ada"
                  : event.message.role
              const saved = await convex.mutation(api.chats.createMessage, {
                chat_id: chatId,
                author,
                content,
                run_id: event.runId,
                session_key: event.sessionKey,
                is_automated: false,
              })
              console.log(
                `[ChatBridge] Saved message: chatId=${chatId} author=${author} id=${saved.id}`,
              )
            }
          }
          break

        case "chat.error":
          console.error("[ChatBridge] Chat error:", event.errorMessage)
          break

        // Typing indicators and deltas handled by Convex reactivity on the client
        default:
          break
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[ChatBridge] Error handling event: ${message}`)
    }
  })

  console.log("[ChatBridge] Listening for chat events...")

  // Keep process alive
  process.on("SIGTERM", () => {
    console.log("[ChatBridge] Shutting down...")
    process.exit(0)
  })
  process.on("SIGINT", () => {
    console.log("[ChatBridge] Shutting down...")
    process.exit(0)
  })
}

main().catch((error) => {
  console.error("[ChatBridge] Fatal error:", error)
  process.exit(1)
})
