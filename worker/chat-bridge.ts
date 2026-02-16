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
import { initializeOpenClawClient, getOpenClawClient } from "../lib/openclaw/client"
import { processMessageContent } from "./image-processor"

const convexUrl = process.env.CONVEX_URL ?? "http://127.0.0.1:3210"
const SUBSCRIPTION_POLL_INTERVAL_MS = 5000 // Check for new chats every 5 seconds

// Track subscribed sessions to avoid duplicate subscriptions
const subscribedSessions = new Set<string>()

async function subscribeToAllActiveChats(convex: ConvexHttpClient) {
  try {
    const client = getOpenClawClient()
    const chats = await convex.query(api.chats.list, {})

    // Subscribe to any new sessions we haven't seen
    let newSubscriptions = 0
    for (const chat of chats) {
      if (chat.session_key && !subscribedSessions.has(chat.session_key)) {
        try {
          await client.subscribeToSession(chat.session_key)
          subscribedSessions.add(chat.session_key)
          newSubscriptions++
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`[ChatBridge] Failed to subscribe to ${chat.session_key}: ${message}`)
        }
      }
    }

    if (newSubscriptions > 0) {
      console.log(`[ChatBridge] Subscribed to ${newSubscriptions} new session(s), total: ${subscribedSessions.size}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[ChatBridge] Error polling for chats: ${message}`)
  }
}

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

  // Set up chat event handler
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

  // Wait for connection, then subscribe to all active chats
  console.log("[ChatBridge] Waiting for OpenClaw connection...")

  // Poll for connection and then subscribe
  const waitForConnectionAndSubscribe = async () => {
    const maxAttempts = 30 // 30 seconds timeout
    let attempts = 0

    while (attempts < maxAttempts) {
      const status = client.getStatus()
      if (status === 'connected') {
        console.log("[ChatBridge] Connected to OpenClaw, subscribing to active chats...")
        await subscribeToAllActiveChats(convex)

        // Start polling for new chats
        setInterval(() => {
          subscribeToAllActiveChats(convex)
        }, SUBSCRIPTION_POLL_INTERVAL_MS)

        return
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
      attempts++
    }

    console.error("[ChatBridge] Timed out waiting for OpenClaw connection")
    process.exit(1)
  }

  // Start subscription process
  waitForConnectionAndSubscribe()

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
