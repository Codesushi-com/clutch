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
 * Parse MEDIA: tags from text content
 * Returns extracted media paths and cleaned text
 */
export function parseMediaTags(text: string): {
  cleanedText: string
  mediaPaths: string[]
} {
  const mediaPaths: string[] = []
  const lines = text.split("\n")
  const keptLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    // Match lines that start with MEDIA: (possibly with leading whitespace)
    if (trimmed.startsWith("MEDIA:")) {
      const mediaPath = trimmed.slice(6).trim() // Remove "MEDIA:" prefix
      // Validate path - only allow safe relative paths starting with ./
      if (
        mediaPath &&
        !mediaPath.startsWith("/") &&
        !mediaPath.startsWith("~") &&
        !mediaPath.includes("..") &&
        !mediaPath.startsWith("file://")
      ) {
        // Remove file:// prefix if present after validation
        const cleanPath = mediaPath.replace(/^file:\/\//, "")
        mediaPaths.push(cleanPath)
      } else if (!mediaPath) {
        // Empty MEDIA: tag - strip it
        continue
      } else {
        // Invalid path, keep the line as-is
        keptLines.push(line)
      }
    } else {
      keptLines.push(line)
    }
  }

  return {
    cleanedText: keptLines.join("\n").trim(),
    mediaPaths,
  }
}

/**
 * Load image from a local path and return a markdown image tag
 */
async function loadLocalImage(mediaPath: string): Promise<string | null> {
  try {
    // Resolve relative to cwd
    const fullPath = path.resolve(process.cwd(), mediaPath)

    // Security check: ensure path is within cwd
    const cwd = process.cwd()
    if (!fullPath.startsWith(cwd)) {
      console.warn(`[ImageProcessor] Path outside cwd rejected: ${mediaPath}`)
      return null
    }

    return await loadImageFromAbsolutePath(fullPath, mediaPath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[ImageProcessor] Failed to load local image: ${message}`)
    return null
  }
}

/**
 * Load image from an absolute path and return a markdown image tag
 * Used for IMAGE: tags that reference /tmp/openclaw-images/
 */
async function loadImageFromAbsolutePath(
  fullPath: string,
  originalPath: string,
): Promise<string | null> {
  try {
    // Read file
    const buffer = await fs.readFile(fullPath)

    // Check size
    if (buffer.length > MAX_IMAGE_SIZE) {
      console.warn(`[ImageProcessor] Image too large: ${buffer.length} bytes`)
      return null
    }

    // Detect MIME type from file extension
    const ext = path.extname(originalPath).toLowerCase()
    let mimeType: string
    switch (ext) {
      case ".png":
        mimeType = "image/png"
        break
      case ".jpg":
      case ".jpeg":
        mimeType = "image/jpeg"
        break
      case ".gif":
        mimeType = "image/gif"
        break
      case ".webp":
        mimeType = "image/webp"
        break
      default:
        console.warn(`[ImageProcessor] Unsupported image extension: ${ext}`)
        return null
    }

    // Validate MIME type
    if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      console.warn(`[ImageProcessor] Unsupported image type: ${mimeType}`)
      return null
    }

    // Ensure upload directory exists
    await ensureUploadDir()

    // Generate filename and save
    const filename = generateImageFilename(mimeType)
    const filePath = path.join(UPLOAD_DIR, filename)
    await fs.writeFile(filePath, buffer)

    // Clean up the original file in /tmp (best effort)
    try {
      await fs.unlink(fullPath)
      console.log(`[ImageProcessor] Cleaned up temp file: ${fullPath}`)
    } catch {
      // Ignore cleanup errors - OS will handle stale files
    }

    // Return public URL
    return `/uploads/images/${filename}`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `[ImageProcessor] Failed to load image from ${originalPath}: ${message}`,
    )
    return null
  }
}

/**
 * Parse IMAGE: tags from text content
 * Returns extracted image paths and cleaned text
 * IMAGE: tags allow absolute paths (unlike MEDIA: which is restricted to cwd)
 */
export function parseImageTags(text: string): {
  cleanedText: string
  imagePaths: string[]
} {
  const imagePaths: string[] = []
  const lines = text.split("\n")
  const keptLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    // Match lines that start with IMAGE: (possibly with leading whitespace)
    if (trimmed.startsWith("IMAGE:")) {
      const imagePath = trimmed.slice(6).trim() // Remove "IMAGE:" prefix
      // Validate path - must be absolute and within /tmp/openclaw-images/
      if (
        imagePath &&
        imagePath.startsWith("/tmp/openclaw-images/") &&
        !imagePath.includes("..")
      ) {
        imagePaths.push(imagePath)
      } else if (!imagePath) {
        // Empty IMAGE: tag - strip it
        continue
      } else {
        // Invalid path, keep the line as-is
        keptLines.push(line)
      }
    } else {
      keptLines.push(line)
    }
  }

  return {
    cleanedText: keptLines.join("\n").trim(),
    imagePaths,
  }
}

/**
 * Process message content and extract images
 * Returns the processed content with image markdown tags
 */
export async function processMessageContent(
  content: string | ContentBlock[],
): Promise<string> {
  // If content is a simple string, check for IMAGE: tags
  if (typeof content === "string") {
    const { cleanedText, imagePaths } = parseImageTags(content)

    // Process any IMAGE: tags
    const imageParts: string[] = []
    for (const imagePath of imagePaths) {
      const imageUrl = await loadImageFromAbsolutePath(imagePath, imagePath)
      if (imageUrl) {
        imageParts.push(`![image](${imageUrl})`)
      }
    }

    // Combine cleaned text with any processed images
    const parts: string[] = []
    if (cleanedText) {
      parts.push(cleanedText)
    }
    if (imageParts.length > 0) {
      parts.push(...imageParts)
    }

    return parts.join("\n\n")
  }

  // Process array of content blocks
  const parts: string[] = []

  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue
    }

    const blockType = block.type

    if (blockType === "text" && block.text) {
      // Text block - check for MEDIA: and IMAGE: tags
      const textContent = String(block.text)

      // First check for IMAGE: tags
      const { cleanedText: textAfterImage, imagePaths } =
        parseImageTags(textContent)

      // Then check for MEDIA: tags in the remaining text
      const { cleanedText, mediaPaths } = parseMediaTags(textAfterImage)

      // Add cleaned text if there's any left
      if (cleanedText) {
        parts.push(cleanedText)
      }

      // Process IMAGE: tags (absolute paths)
      for (const imagePath of imagePaths) {
        const imageUrl = await loadImageFromAbsolutePath(imagePath, imagePath)
        if (imageUrl) {
          parts.push(`![image](${imageUrl})`)
        }
      }

      // Process MEDIA: tags (relative paths within cwd)
      for (const mediaPath of mediaPaths) {
        const imageUrl = await loadLocalImage(mediaPath)
        if (imageUrl) {
          parts.push(`![image](${imageUrl})`)
        }
      }
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
