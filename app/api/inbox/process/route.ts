import { NextRequest, NextResponse } from "next/server"
import { exec, execFile } from "child_process"
import { promisify } from "util"
import { writeFile, mkdir, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

interface ProcessRequest {
  url: string
  messageId: string
  channelId: string
  author: string
  timestamp: string
}

interface YouTubeMetadata {
  title: string
  description: string
  duration: string
  channel: string
  uploadDate: string
  webpageUrl: string
}

interface TranscriptSegment {
  start: string
  text: string
}

const YOUTUBE_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/

function isYouTubeUrl(url: string): boolean {
  return YOUTUBE_REGEX.test(url)
}

function extractVideoId(url: string): string | null {
  const match = url.match(YOUTUBE_REGEX)
  return match ? match[1] : null
}

async function processYouTubeVideo(url: string): Promise<{
  metadata: YouTubeMetadata
  transcript: TranscriptSegment[]
  highlights: string[]
}> {
  const tempDir = join(tmpdir(), `yt-process-${Date.now()}`)
  await mkdir(tempDir, { recursive: true })

  try {
    // Download auto-generated subtitles and info
    await execAsync(
      `yt-dlp --write-auto-sub --write-info-json --skip-download --sub-langs en -o "%(id)s" "${url}"`,
      { cwd: tempDir, timeout: 120000 }
    )

    // Read info JSON
    const infoFiles = await execAsync(`ls *.info.json`, { cwd: tempDir })
    const infoFile = infoFiles.stdout.trim().split("\n")[0]
    const infoContent = await execAsync(`cat "${infoFile}"`, { cwd: tempDir })
    const info = JSON.parse(infoContent.stdout)

    const metadata: YouTubeMetadata = {
      title: info.title || "Unknown",
      description: info.description || "",
      duration: formatDuration(info.duration),
      channel: info.channel || info.uploader || "Unknown",
      uploadDate: info.upload_date || "",
      webpageUrl: info.webpage_url || url,
    }

    // Find and parse VTT subtitle file
    const vttFiles = await execAsync(`ls *.vtt *.en.vtt 2>/dev/null || echo ""`, { cwd: tempDir })
    const vttFile = vttFiles.stdout.trim().split("\n")[0]
    
    let transcript: TranscriptSegment[] = []
    if (vttFile) {
      const vttContent = await execAsync(`cat "${vttFile}"`, { cwd: tempDir })
      transcript = parseVtt(vttContent.stdout)
    }

    // Extract highlights (first segment of each minute + segments mentioning GitHub/projects)
    const highlights = extractHighlights(transcript)

    return { metadata, transcript, highlights }
  } finally {
    // Cleanup temp files
    await rm(tempDir, { recursive: true, force: true })
  }
}

function formatDuration(seconds: number): string {
  if (!seconds) return "Unknown"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  if (mins >= 60) {
    const hours = Math.floor(mins / 60)
    const remainingMins = mins % 60
    return `${hours}:${remainingMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function parseVtt(vttContent: string): TranscriptSegment[] {
  const lines = vttContent.split("\n")
  const segments: TranscriptSegment[] = []
  let currentText = ""
  let currentStart = ""

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip header and empty lines
    if (!trimmed || trimmed === "WEBVTT" || trimmed.startsWith("Kind:") || trimmed.startsWith("Language:")) {
      continue
    }

    // Check for timestamp line (00:00:00.000 --> 00:00:05.000)
    const timeMatch = trimmed.match(/(\d{2}:\d{2}:\d{2}\.\d{3}) -->/)
    if (timeMatch) {
      // Save previous segment if exists
      if (currentText && currentStart) {
        segments.push({
          start: currentStart,
          text: cleanText(currentText),
        })
      }
      currentStart = timeMatch[1].substring(0, 8) // HH:MM:SS
      currentText = ""
      continue
    }

    // Collect text lines (skip cue IDs which are just numbers)
    if (trimmed && !trimmed.match(/^\d+$/) && currentStart) {
      currentText += (currentText ? " " : "") + trimmed
    }
  }

  // Don't forget the last segment
  if (currentText && currentStart) {
    segments.push({
      start: currentStart,
      text: cleanText(currentText),
    })
  }

  return segments
}

function cleanText(text: string): string {
  // Remove HTML tags, VTT positioning markup
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}

function extractHighlights(segments: TranscriptSegment[]): string[] {
  const highlights: string[] = []
  const seenTimes = new Set<string>()
  
  // Add first segment of each 5-minute interval
  for (const segment of segments) {
    const [hours, mins] = segment.start.split(":").map(Number)
    const totalMins = hours * 60 + mins
    const intervalKey = `${Math.floor(totalMins / 5) * 5}`
    
    if (!seenTimes.has(intervalKey) && segment.text.length > 20) {
      seenTimes.add(intervalKey)
      highlights.push(`**${segment.start}** - ${segment.text}`)
      if (highlights.length >= 15) break
    }
  }

  return highlights
}

function generateMarkdown(
  url: string,
  metadata: YouTubeMetadata,
  highlights: string[],
  author: string,
  timestamp: string
): string {
  const date = new Date().toISOString().split("T")[0]

  const frontmatter = `---
source: youtube
url: ${metadata.webpageUrl}
title: "${metadata.title.replace(/"/g, '\\"')}"
date: ${date}
duration: "${metadata.duration}"
channel: "${metadata.channel.replace(/"/g, '\\"')}"
via: discord-inbox
author: ${author}
discord_timestamp: ${timestamp}
---

`

  const content = `# ${metadata.title}

**Video:** ${metadata.webpageUrl}  
**Channel:** ${metadata.channel}  
**Duration:** ${metadata.duration}  
**Via:** Discord inbox from ${author}

## Description

${metadata.description.substring(0, 500)}${metadata.description.length > 500 ? "..." : ""}

## Highlights

${highlights.length > 0 ? highlights.join("\n\n") : "*No transcript highlights available*"}

## Key Takeaways

- *Add your notes here*

## Related Projects

- *Cross-references will be added during review*
`

  return frontmatter + content
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
