/**
 * YouTube processing utilities for inbox automation
 *
 * Extracted from route.ts for testability
 */

import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

export interface YouTubeMetadata {
  title: string
  description: string
  duration: string
  channel: string
  uploadDate: string
  webpageUrl: string
}

export interface TranscriptSegment {
  start: string
  text: string
}

export async function checkYtDlpAvailable(): Promise<boolean> {
  try {
    await execFileAsync("yt-dlp", ["--version"], { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

const YOUTUBE_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/

export function isYouTubeUrl(url: string): boolean {
  return YOUTUBE_REGEX.test(url)
}

export function extractVideoId(url: string): string | null {
  const match = url.match(YOUTUBE_REGEX)
  return match ? match[1] : null
}

export function formatDuration(seconds: number): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "Unknown"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  if (mins >= 60) {
    const hours = Math.floor(mins / 60)
    const remainingMins = mins % 60
    return `${hours}:${remainingMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function parseVtt(vttContent: string): TranscriptSegment[] {
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

export function cleanText(text: string): string {
  // Remove HTML tags, VTT positioning markup
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}

export function extractHighlights(segments: TranscriptSegment[]): string[] {
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

export function generateMarkdown(
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
