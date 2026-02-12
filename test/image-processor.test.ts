/**
 * Tests for image-processor.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { promises as fs } from "fs"
import path from "path"
import { processMessageContent } from "../worker/image-processor"

// Test data - small 1x1 PNG in base64
const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
const TEST_PNG_DATA_URL = `data:image/png;base64,${TEST_PNG_BASE64}`

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "images")

describe("processMessageContent", () => {
  // Clean up any test files after each test
  afterEach(async () => {
    try {
      const files = await fs.readdir(UPLOAD_DIR)
      for (const file of files) {
        if (file.includes("test") || file.match(/^\d+-[a-f0-9]+\.(png|jpg|gif|webp)$/)) {
          await fs.unlink(path.join(UPLOAD_DIR, file))
        }
      }
    } catch {
      // Directory might not exist
    }
  })

  describe("string content", () => {
    it("should return string content as-is", async () => {
      const content = "Hello, world!"
      const result = await processMessageContent(content)
      expect(result).toBe(content)
    })
  })

  describe("text blocks", () => {
    it("should extract text from text blocks", async () => {
      const content = [
        { type: "text", text: "Hello" },
        { type: "text", text: "World" },
      ]
      const result = await processMessageContent(content)
      expect(result).toBe("Hello\n\nWorld")
    })

    it("should handle empty text blocks", async () => {
      const content = [
        { type: "text", text: "Hello" },
        { type: "text" },
        { type: "text", text: "World" },
      ]
      const result = await processMessageContent(content)
      expect(result).toBe("Hello\n\nWorld")
    })
  })

  describe("image_url blocks", () => {
    it("should convert data URL images to markdown", async () => {
      const content = [
        {
          type: "image_url",
          image_url: { url: TEST_PNG_DATA_URL },
        },
      ]
      const result = await processMessageContent(content)
      expect(result).toMatch(/!\[image\]\(\/uploads\/images\/\d+-[a-f0-9]+\.png\)/)
    })

    it("should pass through external HTTP URLs", async () => {
      const content = [
        {
          type: "image_url",
          image_url: { url: "https://example.com/image.png" },
        },
      ]
      const result = await processMessageContent(content)
      expect(result).toBe("![image](https://example.com/image.png)")
    })

    it("should pass through local paths", async () => {
      const content = [
        {
          type: "image_url",
          image_url: { url: "/uploads/images/existing.png" },
        },
      ]
      const result = await processMessageContent(content)
      expect(result).toBe("![image](/uploads/images/existing.png)")
    })
  })

  describe("image blocks with source (Anthropic format)", () => {
    it("should process base64 image with source", async () => {
      const content = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: TEST_PNG_BASE64,
          },
        },
      ]
      const result = await processMessageContent(content)
      expect(result).toMatch(/!\[image\]\(\/uploads\/images\/\d+-[a-f0-9]+\.png\)/)
    })

    it("should detect MIME type from base64 header if not provided", async () => {
      const content = [
        {
          type: "image",
          source: {
            type: "base64",
            data: TEST_PNG_BASE64,
          },
        },
      ]
      const result = await processMessageContent(content)
      expect(result).toMatch(/!\[image\]\(\/uploads\/images\/\d+-[a-f0-9]+\.png\)/)
    })
  })

  describe("image blocks with url", () => {
    it("should process image with data URL", async () => {
      const content = [
        {
          type: "image",
          url: TEST_PNG_DATA_URL,
        },
      ]
      const result = await processMessageContent(content)
      expect(result).toMatch(/!\[image\]\(\/uploads\/images\/\d+-[a-f0-9]+\.png\)/)
    })

    it("should pass through HTTP URLs", async () => {
      const content = [
        {
          type: "image",
          url: "https://example.com/image.jpg",
        },
      ]
      const result = await processMessageContent(content)
      expect(result).toBe("![image](https://example.com/image.jpg)")
    })
  })

  describe("generic blocks with url or data", () => {
    it("should process block with data property", async () => {
      const content = [
        {
          type: "image",
          data: TEST_PNG_BASE64,
          mimeType: "image/png",
        },
      ]
      const result = await processMessageContent(content)
      expect(result).toMatch(/!\[image\]\(\/uploads\/images\/\d+-[a-f0-9]+\.png\)/)
    })

    it("should process block with url property", async () => {
      const content = [
        {
          type: "attachment",
          url: "/uploads/images/file.png",
        },
      ]
      const result = await processMessageContent(content)
      expect(result).toBe("![image](/uploads/images/file.png)")
    })
  })

  describe("mixed content", () => {
    it("should handle mixed text and image blocks", async () => {
      const content = [
        { type: "text", text: "Here is an image:" },
        {
          type: "image_url",
          image_url: { url: TEST_PNG_DATA_URL },
        },
        { type: "text", text: "Isn't it nice?" },
      ]
      const result = await processMessageContent(content)
      expect(result).toContain("Here is an image:")
      expect(result).toContain("Isn't it nice?")
      expect(result).toMatch(/!\[image\]\(\/uploads\/images\/\d+-[a-f0-9]+\.png\)/)
    })

    it("should ignore unknown block types", async () => {
      const content = [
        { type: "text", text: "Hello" },
        { type: "tool_use", name: "read", input: {} },
        { type: "text", text: "World" },
      ]
      const result = await processMessageContent(content)
      expect(result).toBe("Hello\n\nWorld")
    })
  })

  describe("edge cases", () => {
    it("should handle empty content array", async () => {
      const content: Array<{ type: string }> = []
      const result = await processMessageContent(content)
      expect(result).toBe("")
    })

    it("should handle null/undefined blocks gracefully", async () => {
      const content = [
        { type: "text", text: "Hello" },
        null,
        undefined,
        { type: "text", text: "World" },
      ] as unknown[]
      const result = await processMessageContent(content as Parameters<typeof processMessageContent>[0])
      expect(result).toBe("Hello\n\nWorld")
    })

    it("should skip unsupported image types", async () => {
      const content = [
        {
          type: "image_url",
          image_url: { url: "data:image/bmp;base64,Qk08" },
        },
      ]
      const result = await processMessageContent(content)
      // Should return empty since BMP is not supported
      expect(result).toBe("")
    })

    it("should handle malformed data URLs gracefully", async () => {
      const content = [
        {
          type: "image_url",
          image_url: { url: "data:invalid" },
        },
      ]
      // Should not throw
      const result = await processMessageContent(content)
      // May or may not produce output depending on how it's handled
      expect(typeof result).toBe("string")
    })
  })
})
