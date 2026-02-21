import { NextRequest, NextResponse } from "next/server"
import { execFile } from "child_process"
import { promisify } from "util"
import { writeFile, mkdir, rm, readdir, readFile } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import {
  isYouTubeUrl,
  extractVideoId,
  formatDuration,
  parseVtt,
  extractHighlights,
  generateMarkdown,
  checkYtDlpAvailable,
  YouTubeMetadata,
  TranscriptSegment,
} from "./youtube-utils"

const execFileAsync = promisify(execFile)

interface ProcessRequest {
  url: string
  messageId: string
  channelId: string
  author: string
  timestamp: string
}

async function processYouTubeVideo(url: string): Promise<{
  metadata: YouTubeMetadata
  transcript: TranscriptSegment[]
  highlights: string[]
}> {
  // Check yt-dlp is installed before attempting execution
  const ytDlpAvailable = await checkYtDlpAvailable()
  if (!ytDlpAvailable) {
    throw new Error(
      "yt-dlp is not installed or not in PATH. " +
      "Please install yt-dlp: https://github.com/yt-dlp/yt-dlp#installation"
    )
  }

  const tempDir = join(tmpdir(), `yt-process-${Date.now()}`)
  await mkdir(tempDir, { recursive: true })

  try {
    // Download auto-generated subtitles and info using execFile with args array
    // This prevents shell injection compared to string interpolation
    await execFileAsync(
      "yt-dlp",
      [
        "--write-auto-sub",
        "--write-info-json",
        "--skip-download",
        "--sub-langs", "en",
        "-o", "%(id)s",
        url,
      ],
      { cwd: tempDir, timeout: 120000 }
    )

    // Read info JSON file
    const files = await readdir(tempDir)
    const infoFile = files.find(f => f.endsWith(".info.json"))
    if (!infoFile) {
      throw new Error("Failed to download video info: no info.json file found")
    }

    const infoContent = await readFile(join(tempDir, infoFile), "utf-8")
    const info = JSON.parse(infoContent)

    const metadata: YouTubeMetadata = {
      title: info.title || "Unknown",
      description: info.description || "",
      duration: formatDuration(info.duration),
      channel: info.channel || info.uploader || "Unknown",
      uploadDate: info.upload_date || "",
      webpageUrl: info.webpage_url || url,
    }

    // Find and parse VTT subtitle file
    const vttFile = files.find(f => f.endsWith(".vtt") || f.endsWith(".en.vtt"))

    let transcript: TranscriptSegment[] = []
    if (vttFile) {
      const vttContent = await readFile(join(tempDir, vttFile), "utf-8")
      transcript = parseVtt(vttContent)
    }

    // Extract highlights (first segment of each 5-minute interval)
    const highlights = extractHighlights(transcript)

    return { metadata, transcript, highlights }
  } finally {
    // Cleanup temp files
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function saveToInbox(content: string, videoId: string): Promise<string> {
  const inboxDir = join(process.env.HOME || "/home/dan", "notes", "inbox")
  await mkdir(inboxDir, { recursive: true })

  const date = new Date().toISOString().split("T")[0]
  const filename = `${date}-youtube-${videoId}.md`
  const filepath = join(inboxDir, filename)

  await writeFile(filepath, content, "utf-8")
  return filepath
}

async function postDiscordReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
  // Use OpenClaw CLI to post reaction
  const target = `channel:${channelId}`
  await execFileAsync("openclaw", [
    "message", "react",
    "--channel", "discord",
    "--target", target,
    "--message-id", messageId,
    "--emoji", emoji,
  ], { timeout: 10000 })
}

export async function POST(request: NextRequest) {
  let body: ProcessRequest

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const { url, messageId, channelId, author, timestamp } = body

  if (!url || !messageId || !channelId) {
    return NextResponse.json(
      { error: "url, messageId, and channelId are required" },
      { status: 400 }
    )
  }

  // Only process YouTube URLs for now
  if (!isYouTubeUrl(url)) {
    return NextResponse.json(
      { status: "skipped", reason: "Not a YouTube URL" },
      { status: 200 }
    )
  }

  try {
    console.log(`[InboxProcessor] Processing YouTube URL: ${url}`)

    // Process the YouTube video
    const { metadata, highlights } = await processYouTubeVideo(url)

    // Generate markdown content
    const markdown = generateMarkdown(url, metadata, highlights, author || "unknown", timestamp || new Date().toISOString())

    // Save to inbox
    const videoId = extractVideoId(url) || "unknown"
    const filepath = await saveToInbox(markdown, videoId)
    console.log(`[InboxProcessor] Saved video ${videoId} to ${filepath}`)

    // Post success reaction to Discord
    try {
      await postDiscordReaction(channelId, messageId, "✅")
    } catch (reactionError) {
      console.error("[InboxProcessor] Failed to post reaction:", reactionError)
      // Don't fail the request if reaction fails
    }

    return NextResponse.json({
      status: "success",
      filepath,
      title: metadata.title,
      channel: metadata.channel,
      duration: metadata.duration,
    }, { status: 200 })

  } catch (error) {
    console.error("[InboxProcessor] Error processing URL:", error)

    // Post failure reaction to Discord
    try {
      await postDiscordReaction(channelId, messageId, "❌")
    } catch {
      // Ignore reaction errors
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: "Processing failed", details: message },
      { status: 500 }
    )
  }
}