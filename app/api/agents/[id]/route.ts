import { NextRequest, NextResponse } from "next/server"
import { getAgent } from "@/lib/agents/registry"

type RouteContext = {
  params: Promise<{ id: string }>
}

// GET /api/agents/:id — Get agent by ID
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params
  const agent = getAgent(id)
  
  if (!agent) {
    return NextResponse.json(
      { error: "Agent not found" },
      { status: 404 }
    )
  }

  return NextResponse.json({ agent })
}
