/**
 * YouTube Inbox Processing Tests
 *
 * Tests for YouTube URL detection, VTT parsing, markdown generation,
 * and error handling for the Discord inbox automation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Create mock controller that will be hoisted and accessible to both mock factory and tests
const mockController = {
  execFileImpl: vi.fn(),
}

// Mock child_process module - factory is hoisted but references mockController
vi.mock("child_process", () => ({
  __esModule: true,
  default: { execFile: (...args: unknown[]) => mockController.execFileImpl(...args) },
  execFile: (...args: unknown[]) => mockController.execFileImpl(...args),
}))

import {
  isYouTubeUrl,
  extractVideoId,
  formatDuration,
  parseVtt,
  cleanText,
  extractHighlights,
  generateMarkdown,
  checkYtDlpAvailable,
  YouTubeMetadata,
  TranscriptSegment,
} from "./youtube-utils"

describe("isYouTubeUrl", () => {
  it("should return true for standard youtube.com/watch URLs", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true)
    expect(isYouTubeUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true)
  })

  it("should return true for youtu.be short URLs", () => {
    expect(isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true)
    expect(isYouTubeUrl("https://www.youtu.be/dQw4w9WgXcQ")).toBe(true)
  })

  it("should return true for youtube.com/shorts URLs", () => {
    expect(isYouTubeUrl("https://youtube.com/shorts/abc123def45")).toBe(true)
    expect(isYouTubeUrl("https://www.youtube.com/shorts/abc123def45")).toBe(true)
  })

  it("should return true for URLs with additional parameters", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123s")).toBe(true)
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share")).toBe(true)
    expect(isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=456")).toBe(true)
  })

  it("should return true for URLs without protocol", () => {
    expect(isYouTubeUrl("youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true)
    expect(isYouTubeUrl("youtu.be/dQw4w9WgXcQ")).toBe(true)
  })

  it("should return false for non-YouTube URLs", () => {
    expect(isYouTubeUrl("https://vimeo.com/123456")).toBe(false)
    expect(isYouTubeUrl("https://twitch.tv/somechannel")).toBe(false)
    expect(isYouTubeUrl("https://example.com/video")).toBe(false)
    expect(isYouTubeUrl("https://google.com")).toBe(false)
  })

  it("should return false for invalid YouTube-like URLs", () => {
    // Missing video ID entirely
    expect(isYouTubeUrl("https://youtube.com/watch?")).toBe(false)
    expect(isYouTubeUrl("https://youtube.com/watch")).toBe(false)
    // Note: The regex matches any 11-character ID, so partial/overflow IDs that
    // contain at least 11 valid characters will still match (extractVideoId handles validation)
  })

  it("should return false for empty or invalid inputs", () => {
    expect(isYouTubeUrl("")).toBe(false)
    expect(isYouTubeUrl("   ")).toBe(false)
    expect(isYouTubeUrl("not a url")).toBe(false)
  })

  it("should handle YouTube embed URLs", () => {
    // Note: embed URLs are not currently supported
    expect(isYouTubeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(false)
  })
})

describe("extractVideoId", () => {
  it("should extract video ID from watch URLs", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(extractVideoId("https://youtube.com/watch?v=abc123DEF45")).toBe("abc123DEF45")
  })

  it("should extract video ID from short URLs", () => {
    expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(extractVideoId("https://youtu.be/abc123DEF45")).toBe("abc123DEF45")
  })

  it("should extract video ID from shorts URLs", () => {
    expect(extractVideoId("https://youtube.com/shorts/abc123def45")).toBe("abc123def45")
  })

  it("should extract video ID from URLs with extra parameters", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123s&feature=share"
    expect(extractVideoId(url)).toBe("dQw4w9WgXcQ")
  })

  it("should return null for invalid URLs", () => {
    expect(extractVideoId("https://example.com")).toBeNull()
    expect(extractVideoId("not a url")).toBeNull()
    expect(extractVideoId("")).toBeNull()
  })
})

describe("formatDuration", () => {
  it("should format short durations correctly", () => {
    expect(formatDuration(45)).toBe("0:45")
    expect(formatDuration(90)).toBe("1:30")
    expect(formatDuration(299)).toBe("4:59")
  })

  it("should format long durations with hours", () => {
    expect(formatDuration(3600)).toBe("1:00:00")
    expect(formatDuration(3661)).toBe("1:01:01")
    expect(formatDuration(7325)).toBe("2:02:05")
    expect(formatDuration(7200)).toBe("2:00:00")
  })

  it("should pad minutes and seconds with leading zeros", () => {
    expect(formatDuration(65)).toBe("1:05")
    expect(formatDuration(3605)).toBe("1:00:05")
    expect(formatDuration(3725)).toBe("1:02:05")
  })

  it("should handle edge cases", () => {
    expect(formatDuration(0)).toBe("0:00")
    expect(formatDuration(59)).toBe("0:59")
    expect(formatDuration(60)).toBe("1:00")
  })

  it("should return 'Unknown' for invalid inputs", () => {
    expect(formatDuration(NaN)).toBe("Unknown")
    expect(formatDuration(undefined as unknown as number)).toBe("Unknown")
    expect(formatDuration(null as unknown as number)).toBe("Unknown")
  })
})

describe("parseVtt", () => {
  it("should parse basic VTT content", () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:05.000
Hello world

00:00:05.000 --> 00:00:10.000
This is a test`

    const result = parseVtt(vtt)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ start: "00:00:00", text: "Hello world" })
    expect(result[1]).toEqual({ start: "00:00:05", text: "This is a test" })
  })

  it("should handle multi-line text segments", () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:05.000
First line
Second line

00:00:05.000 --> 00:00:10.000
Third line`

    const result = parseVtt(vtt)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ start: "00:00:00", text: "First line Second line" })
    expect(result[1]).toEqual({ start: "00:00:05", text: "Third line" })
  })

  it("should skip cue IDs", () => {
    const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:05.000
First segment

2
00:00:05.000 --> 00:00:10.000
Second segment`

    const result = parseVtt(vtt)
    expect(result).toHaveLength(2)
    expect(result[0].text).toBe("First segment")
    expect(result[1].text).toBe("Second segment")
  })

  it("should handle VTT with Kind and Language headers", () => {
    const vtt = `WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:05.000
Hello world`

    const result = parseVtt(vtt)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ start: "00:00:00", text: "Hello world" })
  })

  it("should parse YouTube auto-generated VTT format", () => {
    const vtt = `WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:04.400
This is a test video about programming

00:00:04.400 --> 00:00:08.800
and how to write clean code

00:00:08.800 --> 00:00:12.000
let's get started`

    const result = parseVtt(vtt)
    expect(result).toHaveLength(3)
    expect(result[0].start).toBe("00:00:00")
    expect(result[0].text).toBe("This is a test video about programming")
    expect(result[1].start).toBe("00:00:04")
    expect(result[2].start).toBe("00:00:08")
  })

  it("should handle empty VTT content", () => {
    expect(parseVtt("")).toEqual([])
    expect(parseVtt("WEBVTT")).toEqual([])
    expect(parseVtt("   ")).toEqual([])
  })

  it("should handle VTT with only headers", () => {
    const vtt = `WEBVTT
Kind: captions
Language: en`
    expect(parseVtt(vtt)).toEqual([])
  })

  it("should handle VTT with positioning markup", () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:05.000 line:90% align:center
Text with positioning`

    const result = parseVtt(vtt)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe("Text with positioning")
  })

  it("should handle timestamps without hours", () => {
    // This shouldn't happen in YouTube VTT but let's be safe
    const vtt = `WEBVTT

00:05.000 --> 00:10.000
Short timestamp`

    // This won't match our regex, so it won't be parsed
    const result = parseVtt(vtt)
    expect(result).toEqual([])
  })
})

describe("cleanText", () => {
  it("should remove HTML tags", () => {
    expect(cleanText("<b>Bold text</b>")).toBe("Bold text")
    expect(cleanText("<i>Italic</i> and <b>bold</b>")).toBe("Italic and bold")
    expect(cleanText("Text with <br/> line break")).toBe("Text with line break")
  })

  it("should decode HTML entities", () => {
    expect(cleanText("&amp;")).toBe("&")
    expect(cleanText("&lt;")).toBe("<")
    expect(cleanText("&gt;")).toBe(">")
    expect(cleanText("A &amp; B &lt; C &gt; D")).toBe("A & B < C > D")
  })

  it("should normalize whitespace", () => {
    expect(cleanText("Multiple   spaces")).toBe("Multiple spaces")
    expect(cleanText("Tabs\t\tand spaces")).toBe("Tabs and spaces")
    expect(cleanText(" Newlines \n here ")).toBe("Newlines here")
    expect(cleanText("  leading and trailing  ")).toBe("leading and trailing")
  })

  it("should handle combined HTML and entities", () => {
    expect(cleanText("<b>Tom &amp; Jerry</b>")).toBe("Tom & Jerry")
  })

  it("should return empty string for empty input", () => {
    expect(cleanText("")).toBe("")
    expect(cleanText("   ")).toBe("")
  })
})

describe("extractHighlights", () => {
  it("should extract first segment of each 5-minute interval", () => {
    const segments: TranscriptSegment[] = [
      { start: "00:00:00", text: "Introduction to the topic" },
      { start: "00:02:30", text: "Some intermediate content here" },
      { start: "00:05:00", text: "Five minute mark reached here" },
      { start: "00:07:45", text: "More content here for testing" },
      { start: "00:10:00", text: "Ten minute mark in the video" },
    ]

    const highlights = extractHighlights(segments)
    expect(highlights).toContain("**00:00:00** - Introduction to the topic")
    expect(highlights).toContain("**00:05:00** - Five minute mark reached here")
    expect(highlights).toContain("**00:10:00** - Ten minute mark in the video")
  })

  it("should skip short segments", () => {
    const segments: TranscriptSegment[] = [
      { start: "00:00:00", text: "Hi" }, // Too short (< 20 chars)
      { start: "00:00:05", text: "This is a longer introduction that should be included" },
    ]

    const highlights = extractHighlights(segments)
    expect(highlights).toHaveLength(1)
    expect(highlights[0]).toContain("00:00:05")
  })

  it("should limit to 15 highlights", () => {
    const segments: TranscriptSegment[] = []
    for (let i = 0; i < 20; i++) {
      segments.push({
        start: `00:${i * 5}:00`,
        text: `This is highlight number ${i} with enough text`,
      })
    }

    const highlights = extractHighlights(segments)
    expect(highlights.length).toBeLessThanOrEqual(15)
  })

  it("should handle segments without 5-minute alignment", () => {
    const segments: TranscriptSegment[] = [
      { start: "00:01:00", text: "One minute in" },
      { start: "00:03:30", text: "Three and a half minutes" },
      { start: "00:06:15", text: "Six minutes" },
    ]

    const highlights = extractHighlights(segments)
    // Should still capture segments in 5-minute buckets
    expect(highlights.length).toBeGreaterThan(0)
  })

  it("should return empty array for no segments", () => {
    expect(extractHighlights([])).toEqual([])
  })

  it("should handle hour transitions", () => {
    const segments: TranscriptSegment[] = [
      { start: "00:58:00", text: "Almost at the hour mark with some content" },
      { start: "01:00:00", text: "One hour in and continuing the discussion" },
      { start: "01:05:00", text: "Five minutes past the hour" },
    ]

    const highlights = extractHighlights(segments)
    expect(highlights).toContain("**01:00:00** - One hour in and continuing the discussion")
    expect(highlights).toContain("**01:05:00** - Five minutes past the hour")
  })
})

describe("generateMarkdown", () => {
  const mockMetadata: YouTubeMetadata = {
    title: "Test Video Title",
    description: "This is a test description for the video.",
    duration: "10:30",
    channel: "Test Channel",
    uploadDate: "2024-01-15",
    webpageUrl: "https://youtube.com/watch?v=test123",
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-02-21"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should generate markdown with correct frontmatter", () => {
    const highlights = ["**00:00:00** - Introduction"]
    const result = generateMarkdown(
      "https://youtube.com/watch?v=test123",
      mockMetadata,
      highlights,
      "testuser",
      "2024-02-21T10:00:00Z"
    )

    expect(result).toContain("source: youtube")
    expect(result).toContain("url: https://youtube.com/watch?v=test123")
    expect(result).toContain('title: "Test Video Title"')
    expect(result).toContain("date: 2024-02-21")
    expect(result).toContain('duration: "10:30"')
    expect(result).toContain('channel: "Test Channel"')
    expect(result).toContain("via: discord-inbox")
    expect(result).toContain("author: testuser")
    expect(result).toContain("discord_timestamp: 2024-02-21T10:00:00Z")
  })

  it("should escape quotes in title", () => {
    const metadataWithQuotes: YouTubeMetadata = {
      ...mockMetadata,
      title: 'The "Best" Programming Video',
    }

    const result = generateMarkdown(
      "https://youtube.com/watch?v=test123",
      metadataWithQuotes,
      [],
      "testuser",
      "2024-02-21T10:00:00Z"
    )

    expect(result).toContain('title: "The \\"Best\\" Programming Video"')
    // Should not have unescaped quotes
    expect(result).not.toContain('title: "The "Best" Programming Video"')
  })

  it("should escape quotes in channel name", () => {
    const metadataWithQuotes: YouTubeMetadata = {
      ...mockMetadata,
      channel: 'The "Official" Channel',
    }

    const result = generateMarkdown(
      "https://youtube.com/watch?v=test123",
      metadataWithQuotes,
      [],
      "testuser",
      "2024-02-21T10:00:00Z"
    )

    expect(result).toContain('channel: "The \\"Official\\" Channel"')
  })

  it("should truncate long descriptions", () => {
    const longDescription = "A".repeat(1000)
    const metadataWithLongDesc: YouTubeMetadata = {
      ...mockMetadata,
      description: longDescription,
    }

    const result = generateMarkdown(
      "https://youtube.com/watch?v=test123",
      metadataWithLongDesc,
      [],
      "testuser",
      "2024-02-21T10:00:00Z"
    )

    expect(result).toContain("...")
    expect(result).not.toContain(longDescription)
  })

  it("should include highlights in the output", () => {
    const highlights = [
      "**00:00:00** - Introduction",
      "**00:05:00** - Main topic",
      "**00:10:00** - Conclusion",
    ]

    const result = generateMarkdown(
      "https://youtube.com/watch?v=test123",
      mockMetadata,
      highlights,
      "testuser",
      "2024-02-21T10:00:00Z"
    )

    expect(result).toContain("## Highlights")
    expect(result).toContain("**00:00:00** - Introduction")
    expect(result).toContain("**00:05:00** - Main topic")
    expect(result).toContain("**00:10:00** - Conclusion")
  })

  it("should show placeholder when no highlights", () => {
    const result = generateMarkdown(
      "https://youtube.com/watch?v=test123",
      mockMetadata,
      [],
      "testuser",
      "2024-02-21T10:00:00Z"
    )

    expect(result).toContain("*No transcript highlights available*")
  })

  it("should include all required sections", () => {
    const result = generateMarkdown(
      "https://youtube.com/watch?v=test123",
      mockMetadata,
      [],
      "testuser",
      "2024-02-21T10:00:00Z"
    )

    expect(result).toContain("# Test Video Title")
    expect(result).toContain("## Description")
    expect(result).toContain("## Highlights")
    expect(result).toContain("## Key Takeaways")
    expect(result).toContain("## Related Projects")
    expect(result).toContain("- *Add your notes here*")
    expect(result).toContain("- *Cross-references will be added during review*")
  })

  it("should handle special characters in metadata", () => {
    const metadataWithSpecial: YouTubeMetadata = {
      title: "Video with \\ backslash",
      description: "Description with <html> tags",
      duration: "5:00",
      channel: "Channel with 🎉 emoji",
      uploadDate: "",
      webpageUrl: "https://youtube.com/watch?v=test",
    }

    const result = generateMarkdown(
      "https://youtube.com/watch?v=test",
      metadataWithSpecial,
      [],
      "testuser",
      "2024-02-21T10:00:00Z"
    )

    expect(result).toContain("# Video with \\ backslash")
    expect(result).toContain("Channel with 🎉 emoji")
  })
})

describe("Integration scenarios", () => {
  it("should process a complete YouTube workflow", () => {
    // Test URL detection
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    expect(isYouTubeUrl(url)).toBe(true)

    // Test video ID extraction
    const videoId = extractVideoId(url)
    expect(videoId).toBe("dQw4w9WgXcQ")

    // Test VTT parsing
    const vttContent = `WEBVTT

00:00:00.000 --> 00:00:05.000
Welcome to this programming tutorial

00:00:05.000 --> 00:05:30.000
Today we will learn about clean code practices`

    const segments = parseVtt(vttContent)
    expect(segments).toHaveLength(2)

    // Test highlight extraction
    const highlights = extractHighlights(segments)
    expect(highlights.length).toBeGreaterThan(0)

    // Test markdown generation
    const metadata: YouTubeMetadata = {
      title: "Programming Tutorial",
      description: "Learn clean code practices",
      duration: "5:30",
      channel: "Code Academy",
      uploadDate: "2024-01-01",
      webpageUrl: url,
    }

    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-02-21"))

    const markdown = generateMarkdown(url, metadata, highlights, "discorduser", "2024-02-21T12:00:00Z")

    expect(markdown).toContain("Programming Tutorial")
    expect(markdown).toContain("Code Academy")
    expect(markdown).toContain("source: youtube")

    vi.useRealTimers()
  })
})

describe("checkYtDlpAvailable", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return true when yt-dlp is installed", async () => {
    mockController.execFileImpl.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, callback: (err: null, result: { stdout: string; stderr: string }) => void) => {
        callback(null, { stdout: "2024.01.01\n", stderr: "" })
      }
    )

    const result = await checkYtDlpAvailable()

    expect(result).toBe(true)
    expect(mockController.execFileImpl).toHaveBeenCalledWith(
      "yt-dlp",
      ["--version"],
      { timeout: 5000 },
      expect.any(Function)
    )
  })

  it("should return false when yt-dlp is not found", async () => {
    mockController.execFileImpl.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, callback: (err: Error, result: { stdout: string; stderr: string }) => void) => {
        const error = new Error("spawn yt-dlp ENOENT")
        callback(error, { stdout: "", stderr: "" })
      }
    )

    const result = await checkYtDlpAvailable()

    expect(result).toBe(false)
  })

  it("should return false when yt-dlp command fails", async () => {
    mockController.execFileImpl.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, callback: (err: Error, result: { stdout: string; stderr: string }) => void) => {
        const error = new Error("Command failed")
        callback(error, { stdout: "", stderr: "error: unknown flag" })
      }
    )

    const result = await checkYtDlpAvailable()

    expect(result).toBe(false)
  })
})
