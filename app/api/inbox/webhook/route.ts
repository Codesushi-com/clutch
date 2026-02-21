import { NextRequest, NextResponse } from "next/server"

interface DiscordMessageWebhook {
  channelId: string
  messageId: string
  content: string
  author: string
  timestamp: string
  urls?: string[]
}

/**
 * Extract URLs from message content
 */
function extractUrls(content: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const matches = content.match(urlRegex)
  return matches || []
}

/**
 * POST /api/inbox/webhook
 * 
 * Called by OpenClaw when a message is received in the Discord inbox channel.
 * Extracts URLs and triggers processing for each one.
 */
export async function POST(request: NextRequest) {
  let body: DiscordMessageWebhook

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const { channelId, messageId, content, author, timestamp } = body

  if (!channelId || !messageId || !content) {
    return NextResponse.json(
      { error: "channelId, messageId, and content are required" },
      { status: 400 }
    )
  }

  // Only process messages from the inbox channel
  const INBOX_CHANNEL_ID = "1474885353453260995"
  if (channelId !== INBOX_CHANNEL_ID) {
    return NextResponse.json(
      { status: "skipped", reason: "Not from inbox channel" },
      { status: 200 }
    )
  }

  // Extract URLs from content
  const urls = body.urls || extractUrls(content)

  if (urls.length === 0) {
    return NextResponse.json(
      { status: "skipped", reason: "No URLs found in message" },
      { status: 200 }
    )
  }

  console.log(`[InboxWebhook] Processing ${urls.length} URL(s) from message ${messageId}`)

  // Process each URL asynchronously
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"}/api/inbox/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          messageId,
          channelId,
          author: author || "unknown",
          timestamp: timestamp || new Date().toISOString(),
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Processing failed: ${error}`)
      }

      return response.json()
    })
  )

  // Summarize results
  const succeeded = results.filter(r => r.status === "fulfilled").length
  const failed = results.filter(r => r.status === "rejected").length

  return NextResponse.json({
    status: "processed",
    urlsProcessed: urls.length,
    succeeded,
    failed,
    results: results.map((r, i) => ({
      url: urls[i],
      status: r.status,
      ...(r.status === "fulfilled" ? { result: r.value } : { error: String(r.reason) }),
    })),
  })
}
