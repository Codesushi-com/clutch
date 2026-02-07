import { NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"

type RouteParams = { params: Promise<{ sessionKey: string }> }

/**
 * GET /api/sessions/{sessionKey}/history
 * 
 * Returns the full session history from the JSONL file.
 * Falls back to gateway RPC if file doesn't exist.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { sessionKey: encodedSessionKey } = await params
  const sessionKey = decodeURIComponent(encodedSessionKey)
  
  // JSONL file path
  const jsonlPath = join(homedir(), ".openclaw", "sessions", `${sessionKey}.jsonl`)
  
  try {
    // Check if file exists
    if (!existsSync(jsonlPath)) {
      return NextResponse.json(
        { 
          error: "Session not found",
          sessionKey,
          path: jsonlPath
        },
        { status: 404 }
      )
    }
    
    // Read and parse JSONL file
    const content = await readFile(jsonlPath, "utf-8")
    const lines = content.trim().split("\n").filter(line => line.trim())
    
    const messages: Array<{
      role: string
      content: string
      timestamp?: string
      tool_calls?: unknown[]
      tool_results?: unknown[]
      model?: string
    }> = []
    
    let sessionInfo: {
      model?: string
      startTime?: number
      endTime?: number
      stopReason?: string
      tokensIn?: number
      tokensOut?: number
    } = {}
    
    for (const line of lines) {
      try {
        const record = JSON.parse(line)
        
        // Handle different record types
        if (record.type === "session_start") {
          sessionInfo = {
            ...sessionInfo,
            model: record.model,
            startTime: record.timestamp,
          }
        } else if (record.type === "session_end") {
          sessionInfo = {
            ...sessionInfo,
            endTime: record.timestamp,
            stopReason: record.stopReason,
            tokensIn: record.tokensIn,
            tokensOut: record.tokensOut,
          }
        } else if (record.role) {
          // Message record
          messages.push({
            role: record.role,
            content: record.content || "",
            timestamp: record.timestamp ? new Date(record.timestamp).toISOString() : undefined,
            tool_calls: record.tool_calls,
            tool_results: record.tool_results,
            model: record.model,
          })
        }
      } catch (parseError) {
        // Skip malformed lines
        console.warn(`[SessionHistory] Failed to parse line: ${parseError}`)
      }
    }
    
    return NextResponse.json({
      sessionKey,
      messages,
      ...sessionInfo,
    })
    
  } catch (error) {
    console.error(`[SessionHistory] Error reading session file:`, error)
    return NextResponse.json(
      { 
        error: "Failed to read session history",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
