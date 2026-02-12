/**
 * Image attachment processor for chat messages
 *
 * Handles extracting image data from message content blocks,
 * saving them to disk, and converting them to markdown image tags.
 */

import { promises as fs } from "fs"
import path from "path"
import crypto from "crypto"

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "images")

// Supported image MIME types
const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]

// File extensions for MIME types
const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
}

// Maximum image size (10MB)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024

/**
 * Generic image block interface
 */
interface ImageBlock {
  type?: string
  url?: string
  data?: string
  mimeType?: string
  media_type?: string
  image_url?: { url: string }
  source?: {
    type: string
    media_type?: string
    data?: string
  }
}

/**
 * Content block from OpenClaw message
 */
interface ContentBlock {
  type: string
  text?: string
  url?: string
  data?: string
  mimeType?: string
  media_type?: string
  image_url?: { url: string }
  source?: {
    type: string
    media_type?: string
    data?: string
  }
  [key: string]: unknown
}

/**
 * Ensure the upload directory exists
 */
async function ensureUploadDir(): Promise<void> {
  try {
    await fs.access(UPLOAD_DIR)
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
  }
}

/**
 * Generate a unique filename for an image
 */
function generateImageFilename(mimeType: string): string {
  const timestamp = Date.now()
  const random = crypto.randomBytes(4).toString("hex")
  const ext = MIME_TO_EXT[mimeType] || ".png"
  return `${timestamp}-${random}${ext}`
}

/**
 * Detect MIME type from base64 data or data URL
 */
function detectMimeType(data: string): string | null {
  // Check if it's a data URL
  const dataUrlMatch = data.match(/^data:([a-zA-Z0-9/+]+);base64,/)
  if (dataUrlMatch) {
    return dataUrlMatch[1]
  }

  // Try to detect from base64 header bytes
  // PNG: iVBORw0KGgo
  // JPEG: /9j/4
  // GIF: R0lGOD
  // WebP: UklGR
  const header = data.slice(0, 20)
  if (header.startsWith("iVBORw0KGgo")) return "image/png"
  if (header.startsWith("/9j/4")) return "image/jpeg"
  if (header.startsWith("R0lGOD")) return "image/gif"
  if (header.startsWith("UklGR")) return "image/webp"

  return null
}

/**
 * Extract base64 data from a data URL or return as-is if already base64
 */
function extractBase64Data(data: string): string {
  const dataUrlMatch = data.match(/^data:[a-zA-Z0-9/+]+;base64,(.+)$/)
  if (dataUrlMatch) {
    return dataUrlMatch[1]
  }
  return data
}

/**
 * Save a base64-encoded image to disk
 */
async function saveBase64Image(
  base64Data: string,
  mimeType: string,
): Promise<string | null> {
  // Validate MIME type
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    console.warn(`[ImageProcessor] Unsupported image type: ${mimeType}`)
    return null
  }

  try {
    const cleanBase64 = extractBase64Data(base64Data)
    const buffer = Buffer.from(cleanBase64, "base64")

    // Check size
    if (buffer.length > MAX_IMAGE_SIZE) {
      console.warn(`[ImageProcessor] Image too large: ${buffer.length} bytes`)
      return null
    }

    // Ensure upload directory exists
    await ensureUploadDir()

    // Generate filename and save
    const filename = generateImageFilename(mimeType)
    const filePath = path.join(UPLOAD_DIR, filename)
    await fs.writeFile(filePath, buffer)

    // Return public URL
    return `/uploads/images/${filename}`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[ImageProcessor] Failed to save image: ${message}`)
    return null
  }
}

/**
 * Process an image block and return a markdown image tag if successful
 */
async function processImageBlock(block: ImageBlock): Promise<string | null> {
  try {
    let imageUrl: string | null = null

    // Handle image_url type (OpenAI format)
    if (block.type === "image_url" && block.image_url?.url) {
      const url = block.image_url.url
      // If it's a data URL, save it
      if (url.startsWith("data:")) {
        const mimeType = detectMimeType(url) || "image/png"
        const base64Data = extractBase64Data(url)
        imageUrl = await saveBase64Image(base64Data, mimeType)
      } else if (url.startsWith("http")) {
        // External URL - use as-is
        imageUrl = url
      } else if (url.startsWith("/")) {
        // Already a local path
        imageUrl = url
      }
    }
    // Handle image type with source (Anthropic format)
    else if (block.type === "image" && block.source) {
      if (block.source.type === "base64" && block.source.data) {
        const mimeType =
          block.source.media_type ||
          detectMimeType(block.source.data) ||
          "image/png"
        imageUrl = await saveBase64Image(block.source.data, mimeType)
      }
    }
    // Handle image type with url
    else if (block.type === "image" && block.url) {
      if (block.url.startsWith("data:")) {
        const mimeType = detectMimeType(block.url) || "image/png"
        const base64Data = extractBase64Data(block.url)
        imageUrl = await saveBase64Image(base64Data, mimeType)
      } else {
        imageUrl = block.url
      }
    }
    // Handle generic block with url or data
    else if (block.url || block.data) {
      if (block.data) {
        const mimeType =
          block.mimeType || block.media_type || detectMimeType(block.data) || "image/png"
        imageUrl = await saveBase64Image(block.data, mimeType)
      } else if (block.url) {
        if (block.url.startsWith("data:")) {
          const mimeType = detectMimeType(block.url) || "image/png"
          const base64Data = extractBase64Data(block.url)
          imageUrl = await saveBase64Image(base64Data, mimeType)
        } else if (block.url.startsWith("http") || block.url.startsWith("/")) {
          imageUrl = block.url
        }
      }
    }

    if (imageUrl) {
      return `![image](${imageUrl})`
    }

    return null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[ImageProcessor] Error processing image block: ${message}`)
    return null
  }
}

/**
 * Check if a content block is an image
 */
function isImageBlock(block: ContentBlock): boolean {
  if (!block || typeof block !== "object") return false

  const blockType = block.type
  return (
    blockType === "image" ||
    blockType === "image_url" ||
    !!block.url ||
    !!block.data
  )
}

/**
 * Process message content and extract images
 * Returns the processed content with image markdown tags
 */
export async function processMessageContent(
  content: string | ContentBlock[],
): Promise<string> {
  // If content is a simple string, return as-is
  if (typeof content === "string") {
    return content
  }

  // Process array of content blocks
  const parts: string[] = []

  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue
    }

    const blockType = block.type

    if (blockType === "text" && block.text) {
      // Text block - add to content
      parts.push(String(block.text))
    } else if (isImageBlock(block)) {
      // Image block - process and convert to markdown
      const imageMarkdown = await processImageBlock(block)
      if (imageMarkdown) {
        parts.push(imageMarkdown)
      }
    }
    // Ignore other block types (tool_use, tool_result, etc.)
  }

  return parts.join("\n\n")
}
