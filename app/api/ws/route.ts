import { NextRequest } from 'next/server'

// Since Next.js App Router doesn't support WebSocket upgrades directly,
// we'll use a custom server approach. This route helps with detection.
export async function GET(request: NextRequest) {
  const upgrade = request.headers.get('upgrade')
  
  if (upgrade !== 'websocket') {
    return Response.json({ 
      error: 'This endpoint is for WebSocket connections only',
      hint: 'Use a WebSocket client with proper Upgrade headers'
    }, { status: 400 })
  }

  // WebSocket upgrade handling needs to be done at the server level
  // Since this is Next.js App Router, we can't handle the upgrade here
  return new Response('WebSocket upgrade should be handled by custom server', {
    status: 426,
    statusText: 'Upgrade Required',
    headers: { 
      'Upgrade': 'websocket',
      'Connection': 'Upgrade'
    }
  })
}

export const dynamic = 'force-dynamic'