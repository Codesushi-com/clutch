import { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  // Legacy WebSocket endpoint - now handled by Convex reactivity
  return Response.json({ 
    message: "WebSocket server disabled - using Convex reactivity",
    status: "deprecated" 
  })
}

export const dynamic = 'force-dynamic'