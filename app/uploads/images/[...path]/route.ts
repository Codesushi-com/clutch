import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "images")

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
}

type RouteParams = { params: Promise<{ path: string[] }> }

/**
 * GET /uploads/images/:filename
 *
 * Serves uploaded images from disk. Next.js production mode only serves
 * public/ files that existed at build time, so dynamically uploaded images
 * need an API route to be served.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { path: segments } = await params
  const filename = segments.join("/")

  // Prevent directory traversal
  if (filename.includes("..") || filename.includes("~")) {
    return new NextResponse("Not found", { status: 404 })
  }

  const filePath = path.join(UPLOAD_DIR, filename)

  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) {
      return new NextResponse("Not found", { status: 404 })
    }

    const ext = path.extname(filename).toLowerCase()
    const contentType = MIME_TYPES[ext] || "application/octet-stream"
    const data = await fs.readFile(filePath)

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": stat.size.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch {
    return new NextResponse("Not found", { status: 404 })
  }
}
