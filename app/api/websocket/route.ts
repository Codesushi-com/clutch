import { NextRequest } from "next/server"
import { wsManager } from "@/lib/websocket/server"

export async function GET(request: NextRequest) {
  // For WebSocket upgrade, we need to handle this in a custom server
  // This endpoint just returns connection info for now
  return Response.json({ 
    message: "WebSocket server running on port 3003",
    port: 3003,
    status: "active" 
  })
}

// This is a placeholder - actual WebSocket handling is done by wsManager directly
export const dynamic = 'force-dynamic'