import { NextRequest, NextResponse } from "next/server"
import { existsSync, statSync } from "fs"
import { resolve } from "path"

export async function POST(request: NextRequest) {
  try {
    const { path } = await request.json()
    
    if (!path || typeof path !== 'string') {
      return NextResponse.json(
        { error: "Path is required and must be a string" },
        { status: 400 }
      )
    }

    const normalizedPath = path.trim()
    
    if (!normalizedPath) {
      return NextResponse.json(
        { error: "Path cannot be empty" },
        { status: 400 }
      )
    }

    try {
      // Resolve the path to handle relative paths and symlinks
      const resolvedPath = resolve(normalizedPath)
      
      // Check if the path exists
      const exists = existsSync(resolvedPath)
      
      if (!exists) {
        return NextResponse.json({
          exists: false,
          resolved: resolvedPath
        })
      }

      // Check if it's a directory
      const stats = statSync(resolvedPath)
      const isDirectory = stats.isDirectory()
      
      return NextResponse.json({
        exists: true,
        isDirectory,
        resolved: resolvedPath
      })
      
    } catch (err) {
      // Handle permission errors or invalid paths
      return NextResponse.json({
        exists: false,
        error: `Cannot access path: ${err instanceof Error ? err.message : 'Unknown error'}`
      })
    }
    
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    )
  }
}