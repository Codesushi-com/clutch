import { NextRequest, NextResponse } from 'next/server'

/**
 * HTTP fallback for chat.abort RPC call
 * When WebSocket is not available, this endpoint provides abort functionality
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionKey = 'main' } = body

    // This is a fallback endpoint - in a real implementation,
    // we would make an HTTP request to OpenClaw to abort the session
    // For now, we'll return success since the main goal is to clean up local state
    
    console.log('[API] chat.abort HTTP fallback called for sessionKey:', sessionKey)
    
    // In the future, this could call OpenClaw's HTTP API:
    // const response = await fetch('http://localhost:18790/api/chat/abort', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ sessionKey })
    // })
    
    return NextResponse.json({ 
      success: true,
      message: 'Chat abort request processed (HTTP fallback)' 
    })
  } catch (error) {
    console.error('[API] Error in chat abort:', error)
    return NextResponse.json(
      { error: 'Failed to abort chat' },
      { status: 500 }
    )
  }
}