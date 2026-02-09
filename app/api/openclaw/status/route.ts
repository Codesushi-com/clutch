import { NextResponse } from 'next/server'
import { getOpenClawClient } from '@/lib/openclaw'

/**
 * GET /api/openclaw/status
 * Returns the current OpenClaw connection status
 */
export async function GET() {
  try {
    const client = getOpenClawClient()
    const status = client.getStatus()
    
    return NextResponse.json({
      status,
      connected: status === 'connected',
      wsUrl: process.env.OPENCLAW_WS_URL || 'ws://127.0.0.1:4440/ws'
    })
  } catch (error) {
    return NextResponse.json(
      { 
        status: 'error', 
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/openclaw/status
 * Trigger reconnection if disconnected
 */
export async function POST() {
  try {
    const client = getOpenClawClient()
    const currentStatus = client.getStatus()
    
    if (currentStatus === 'disconnected') {
      client.connect()
      return NextResponse.json({
        message: 'Reconnection initiated',
        previousStatus: currentStatus
      })
    }
    
    return NextResponse.json({
      message: 'Already connected or connecting',
      status: currentStatus
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reconnect' },
      { status: 500 }
    )
  }
}
