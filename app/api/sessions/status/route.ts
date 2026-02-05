import { NextRequest, NextResponse } from "next/server"

export interface SessionStatusInfo {
  id: string
  status: 'running' | 'idle' | 'completed' | 'error' | 'cancelled' | 'not_found'
  updatedAt?: string
  model?: string
  tokens?: {
    input: number
    output: number
    total: number
  }
  lastActivity?: string
  isActive: boolean
  isIdle: boolean
  isStuck: boolean
}

/**
 * POST /api/sessions/status
 * Get status for multiple session IDs
 * 
 * Body: { sessionIds: string[] }
 * Returns: { sessions: Record<string, SessionStatusInfo> }
 */
export async function POST(request: NextRequest) {
  try {
    const { sessionIds } = await request.json()
    
    if (!Array.isArray(sessionIds)) {
      return NextResponse.json(
        { error: "sessionIds must be an array" },
        { status: 400 }
      )
    }
    
    // OpenClaw gateway HTTP endpoint
    const openclawUrl = process.env.OPENCLAW_HTTP_URL || 'http://127.0.0.1:4440'
    const openclawToken = process.env.OPENCLAW_TOKEN || process.env.NEXT_PUBLIC_OPENCLAW_TOKEN || ''
    
    const sessions: Record<string, SessionStatusInfo> = {}
    const now = Date.now()
    const IDLE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
    const STUCK_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes
    
    // Fetch session info for each session ID
    for (const sessionId of sessionIds) {
      if (!sessionId || typeof sessionId !== 'string') {
        sessions[sessionId] = {
          id: sessionId,
          status: 'not_found',
          isActive: false,
          isIdle: false,
          isStuck: false
        }
        continue
      }
      
      try {
        // Try to get session info via HTTP RPC to OpenClaw
        const rpcRequest = {
          type: 'req',
          id: crypto.randomUUID(),
          method: 'sessions.list',
          params: { keys: [sessionId] }
        }
        
        const httpResponse = await fetch(`${openclawUrl}/rpc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': openclawToken ? `Bearer ${openclawToken}` : ''
          },
          body: JSON.stringify(rpcRequest)
        })
        
        if (!httpResponse.ok) {
          throw new Error(`OpenClaw HTTP ${httpResponse.status}: ${httpResponse.statusText}`)
        }
        
        const rpcResponse = await httpResponse.json()
        if (!rpcResponse.ok || rpcResponse.error) {
          throw new Error(rpcResponse.error?.message || 'OpenClaw RPC error')
        }
        
        const sessionInfo = rpcResponse.payload?.sessions?.[0]
        
        if (!sessionInfo) {
          sessions[sessionId] = {
            id: sessionId,
            status: 'not_found',
            isActive: false,
            isIdle: false,
            isStuck: false
          }
          continue
        }
        
        const updatedAt = sessionInfo.updatedAt
        const lastActivityMs = updatedAt ? new Date(updatedAt).getTime() : now
        const timeSinceActivity = now - lastActivityMs
        
        // Determine status based on activity
        const isActive = timeSinceActivity < IDLE_THRESHOLD_MS
        const isIdle = timeSinceActivity >= IDLE_THRESHOLD_MS && timeSinceActivity < STUCK_THRESHOLD_MS
        const isStuck = timeSinceActivity >= STUCK_THRESHOLD_MS
        
        let status: SessionStatusInfo['status'] = 'idle'
        if (isActive) status = 'running'
        else if (isStuck) status = 'error' // Treat stuck as error state
        
        sessions[sessionId] = {
          id: sessionId,
          status,
          updatedAt,
          model: sessionInfo.model,
          tokens: {
            input: sessionInfo.inputTokens || 0,
            output: sessionInfo.outputTokens || 0,
            total: sessionInfo.totalTokens || 0
          },
          lastActivity: updatedAt,
          isActive,
          isIdle,
          isStuck
        }
      } catch (error) {
        console.error(`Failed to get status for session ${sessionId}:`, error)
        sessions[sessionId] = {
          id: sessionId,
          status: 'error',
          isActive: false,
          isIdle: false,
          isStuck: false
        }
      }
    }
    
    return NextResponse.json({ sessions })
  } catch (error) {
    console.error("Failed to get session status:", error)
    return NextResponse.json(
      { error: "Failed to get session status", details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * GET /api/sessions/status?sessionId=xxx
 * Get status for a single session ID (for testing)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')
  
  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId parameter is required" },
      { status: 400 }
    )
  }
  
  // Use the POST handler with a single session ID
  const mockRequest = {
    json: async () => ({ sessionIds: [sessionId] })
  } as NextRequest
  
  const response = await POST(mockRequest)
  const data = await response.json()
  
  return NextResponse.json({
    session: data.sessions?.[sessionId] || null
  })
}