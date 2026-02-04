import { NextResponse } from "next/server"
import { getAllAgents } from "@/lib/agents/registry"

// GET /api/agents — List all agents
export async function GET() {
  const agents = getAllAgents()
  return NextResponse.json({ agents })
}
