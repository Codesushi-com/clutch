import { NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"

type RouteParams = { params: Promise<{ sessionKey: string }> }

/**
 * Session entry from sessions.json mapping file
 */
interface SessionEntry {
  sessionId: string
  updatedAt: number
  systemSent?: boolean
}

/**
 * JSONL record types
 */
interface JSONLRecord {
  type: string
  timestamp?: string
  id?: string
  version?: number
  cwd?: string
  model?: string
  provider?: string
  content?: Array<{ type: string; text?: string }> | string
  message?: {
    role: string
    content: Array<{ type: string; text?: string }> | string
    model?: string
    provider?: string
    stopReason?: string
    usage?: {
      input?: number
      output?: number
      cacheRead?: number
      cacheWrite?: number
      totalTokens?: number
      cost?: {
        input?: number
        output?: number
        cacheRead?: number
        cacheWrite?: number
        total?: number
      }
    }
  }
  toolName?: string
  toolCallId?: string
  result?: unknown
  stopReason?: string
  tokensIn?: number
  tokensOut?: number
}

/**
 * Resolve session key to session UUID via sessions.json
 */
async function resolveSessionUuid(sessionKey: string): Promise<string | null> {
  const sessionsJsonPath = join(homedir(), ".openclaw", "agents", "main", "sessions", "sessions.json")
  
  if (!existsSync(sessionsJsonPath)) {
    return null
  }
  
  try {
    const content = await readFile(sessionsJsonPath, "utf-8")
    const sessions = JSON.parse(content) as Record<string, SessionEntry>
    const entry = sessions[sessionKey]
    return entry?.sessionId || null
  } catch {
    return null
  }
}

/**
 * GET /api/sessions/{sessionKey}/history
 * 
 * Returns the full session history from the JSONL file.
 * The session key is resolved to a UUID via sessions.json.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { sessionKey: encodedSessionKey } = await params
  const sessionKey = decodeURIComponent(encodedSessionKey)
  
  // Resolve session key to UUID
  const sessionUuid = await resolveSessionUuid(sessionKey)
  if (!sessionUuid) {
    return NextResponse.json(
      { 
        error: "Session not found",
        sessionKey,
      },
      { status: 404 }
    )
  }
  
  // JSONL file path uses UUID, not session key
  const jsonlPath = join(homedir(), ".openclaw", "agents", "main", "sessions", `${sessionUuid}.jsonl`)
  
  try {
    // Check if file exists
    if (!existsSync(jsonlPath)) {
      return NextResponse.json(
        { 
          error: "Session file not found",
          sessionKey,
          sessionUuid,
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
      provider?: string
      startTime?: string
      endTime?: string
      stopReason?: string
      tokensIn?: number
      tokensOut?: number
      tokensCacheRead?: number
      tokensCacheWrite?: number
      costTotal?: number
    } = {
      tokensIn: 0,
      tokensOut: 0,
      tokensCacheRead: 0,
      tokensCacheWrite: 0,
      costTotal: 0,
    }
    
    for (const line of lines) {
      try {
        const record = JSON.parse(line) as JSONLRecord

        // Track end time as the last timestamp we see
        if (record.timestamp) {
          sessionInfo.endTime = record.timestamp
        }

        // Handle different record types based on 'type' field
        switch (record.type) {
          case "session":
            sessionInfo = {
              ...sessionInfo,
              startTime: record.timestamp,
            }
            break

          case "model_change":
            if (record.model) sessionInfo.model = record.model
            if (record.provider) sessionInfo.provider = record.provider
            break
            
          case "human":
            messages.push({
              role: "user",
              content: extractContentText(record.content) || "",
              timestamp: record.timestamp,
            })
            break
            
          case "assistant":
            messages.push({
              role: "assistant",
              content: extractContentText(record.content) || "",
              timestamp: record.timestamp,
              model: record.model,
            })

            if (record.model) sessionInfo.model = record.model
            if (record.provider) sessionInfo.provider = record.provider
            if (record.stopReason) sessionInfo.stopReason = record.stopReason
            if (typeof record.tokensIn === "number") sessionInfo.tokensIn = (sessionInfo.tokensIn || 0) + record.tokensIn
            if (typeof record.tokensOut === "number") sessionInfo.tokensOut = (sessionInfo.tokensOut || 0) + record.tokensOut
            break
            
          case "message":
            // Handle nested message format
            if (record.message) {
              const role = record.message.role === "user" ? "user" :
                          record.message.role === "assistant" ? "assistant" : "system"
              messages.push({
                role,
                content: extractContentText(record.message.content) || "",
                timestamp: record.timestamp,
                model: record.message.model || record.model,
              })

              // Accumulate usage from assistant messages
              if (record.message.role === "assistant") {
                if (record.message.model) sessionInfo.model = record.message.model
                if (record.message.provider) sessionInfo.provider = record.message.provider
                if (record.message.stopReason) sessionInfo.stopReason = record.message.stopReason

                const usage = record.message.usage
                if (usage) {
                  sessionInfo.tokensIn = (sessionInfo.tokensIn || 0) + (usage.input || 0)
                  sessionInfo.tokensOut = (sessionInfo.tokensOut || 0) + (usage.output || 0)
                  sessionInfo.tokensCacheRead = (sessionInfo.tokensCacheRead || 0) + (usage.cacheRead || 0)
                  sessionInfo.tokensCacheWrite = (sessionInfo.tokensCacheWrite || 0) + (usage.cacheWrite || 0)
                  sessionInfo.costTotal = (sessionInfo.costTotal || 0) + (usage.cost?.total || 0)
                }
              }
            }
            break
            
          case "tool_use":
            messages.push({
              role: "tool_use",
              content: `Using tool: ${record.toolName || "unknown"}`,
              timestamp: record.timestamp,
            })
            break
            
          case "tool_result":
            messages.push({
              role: "tool_result",
              content: `Tool result: ${record.toolCallId || "unknown"}`,
              timestamp: record.timestamp,
            })
            break
            
          case "custom":
            // Skip custom records (model snapshots, etc.)
            break
            
          case "thinking_level_change":
            // Skip thinking level changes
            break
            
          default:
            // Unknown type - skip
            break
        }
      } catch (parseError) {
        // Skip malformed lines
        console.warn(`[SessionHistory] Failed to parse line: ${parseError}`)
      }
    }
    
    return NextResponse.json({
      sessionKey,
      sessionUuid,
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

/**
 * Extract text content from various content formats
 */
function extractContentText(content: JSONLRecord["content"]): string {
  if (!content) {
    return ""
  }
  
  if (typeof content === "string") {
    return content
  }
  
  if (Array.isArray(content)) {
    return content
      .map(entry => {
        if (entry.type === "text" && entry.text) {
          return entry.text
        }
        if (entry.type === "thinking" && entry.text) {
          return `[Thinking: ${entry.text.substring(0, 200)}...]`
        }
        return ""
      })
      .filter(Boolean)
      .join("\n")
  }
  
  return ""
}
