/**
 * Chat Bridge Process
 *
 * Standalone process that connects to the OpenClaw gateway via WebSocket
 * and syncs chat events (agent messages) to Convex.
 *
 * OpenClaw broadcasts chat events to ALL connected WS clients automatically.
 *
 * Architecture:
 *   - Parent session (e.g. "clutch:clutch:<chatId>") receives "final" WITHOUT message body
 *   - Agent session (e.g. "agent:main:clutch:...") receives deltas only, no final
 *   - On "final", we fetch the latest message via chat.history RPC
 *
 * Run separately from Next.js:
 *   npx tsx worker/chat-bridge.ts
 */

import { ConvexHttpClient } from "convex/browser"
import { api } from "../convex/_generated/api"
import { getOpenClawClient, initializeOpenClawClient } from "../lib/openclaw/client"
import { processMessageContent } from "./image-processor"

const convexUrl = process.env.CONVEX_URL ?? "http://127.0.0.1:3210"

type HistoryMessage = {
  role: string
  text: string
  model?: string
  timestamp?: number
}

type HistoryResponse = {
  messages?: HistoryMessage[]
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

  client.onChatEvent(async (event) => {
    try {
      // Only care about "final" events (complete agent response)
      if (event.type !== "chat.final" && event.type !== "chat.message") return

      // Resolve session key to a chat — handle both parent and agent-prefixed keys
      let chat = await convex.query(api.chats.findBySessionKey, {
        sessionKey: event.sessionKey,
      })
      // Agent sessions are prefixed with "agent:main:" — strip and try parent key
      if (!chat && event.sessionKey.startsWith("agent:main:")) {
        const parentKey = event.sessionKey.slice("agent:main:".length)
        chat = await convex.query(api.chats.findBySessionKey, {
          sessionKey: parentKey,
        })
      }
      if (!chat) return

      console.log(`[ChatBridge] Final event for chat ${chat.id}, fetching latest message...`)

      // Fetch the latest message from OpenClaw via chat.history
      const ocClient = getOpenClawClient()
      let history: HistoryResponse
      try {
        history = await ocClient.rpc<HistoryResponse>("chat.history", {
          sessionKey: event.sessionKey,
          limit: 1,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[ChatBridge] Failed to fetch history: ${msg}`)
        return
      }

      const messages = history.messages
      if (!messages || messages.length === 0) {
        console.warn(`[ChatBridge] No messages in history for ${event.sessionKey}`)
        return
      }

      const lastMsg = messages[messages.length - 1]
      if (lastMsg.role !== "assistant") {
        // Last message is user message, skip (we already have it from the send path)
        return
      }

      // History returns `content` (not `text`) — may be string or content blocks array
      const rawContent = (lastMsg as HistoryMessage & { content?: unknown }).content ?? lastMsg.text ?? ""
      let textContent: string
      if (typeof rawContent === "string") {
        textContent = rawContent
      } else if (Array.isArray(rawContent)) {
        // Extract text from content blocks, skip tool calls/results
        type ContentBlock = { type: string; text?: string }
        textContent = (rawContent as ContentBlock[])
          .filter((block) => block.type === "text" && typeof block.text === "string")
          .map((block) => block.text as string)
          .join("\n")
      } else {
        textContent = String(rawContent)
      }
      const content = await processMessageContent(textContent)
      if (!content.trim()) return

      // Dedup by run_id
      if (event.runId) {
        const existing = await convex.query(api.chats.getMessageByRunId, {
          runId: event.runId,
        })
        if (existing) return
      }

      const saved = await convex.mutation(api.chats.createMessage, {
        chat_id: chat.id,
        author: "ada",
        content,
        run_id: event.runId,
        session_key: event.sessionKey,
        is_automated: false,
      })
      console.log(
        `[ChatBridge] Saved message: chatId=${chat.id} id=${saved.id} (${content.slice(0, 60)}...)`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[ChatBridge] Error handling event: ${message}`)
    }
  })

  console.log("[ChatBridge] Listening for chat events...")

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
