"use client"

import { Activity } from "lucide-react"
import { SessionsAgentsCard } from "./sessions-agents-card"
import { ChannelHealthCard, type Channel, type ChannelType, type ChannelStatus } from "./channel-health-card"
import { GatewayHealthCard } from "./gateway-health-card"
import { UsageCostCard } from "./usage-cost-card"
import { useOpenClawDashboard } from "@/lib/hooks/use-openclaw-dashboard"

// Map API channel IDs to our ChannelType
const CHANNEL_TYPE_MAP: Record<string, ChannelType> = {
  discord: "discord",
  telegram: "telegram",
  signal: "signal",
  clutch: "clutch",
  whatsapp: "whatsapp",
}

// Get channel type from API channel ID (with fallback)
function getChannelType(id: string): ChannelType {
  return CHANNEL_TYPE_MAP[id] || "clutch"
}

// Map API connected boolean to our ChannelStatus
function getChannelStatus(connected: boolean): ChannelStatus {
  return connected ? "connected" : "disconnected"
}

interface OpenClawSidebarProps {
  children?: React.ReactNode
  projectId?: string | null
}

export function OpenClawSidebar({ children, projectId }: OpenClawSidebarProps) {
  const { data, isLoading } = useOpenClawDashboard()

  // Transform API channel data to Channel format
  const channels: Channel[] = data?.channels
    ? data.channels.map((ch) => ({
        id: ch.id,
        type: getChannelType(ch.id),
        name: ch.label || ch.id,
        status: getChannelStatus(ch.connected),
      }))
    : []

  return (
    <aside className="w-full lg:w-80 xl:w-88 flex-shrink-0 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <Activity className="w-4 h-4 text-[var(--accent-green)]" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">
          OpenClaw
        </h2>
        <span
          className="w-2 h-2 rounded-full bg-[var(--accent-green)]"
          style={{ animation: "pulse 2s ease-in-out infinite" }}
          title="Connected"
        />
      </div>

      {/* Widget container */}
      <div className="space-y-3">
        {children ?? (
          <>
            {/* Gateway Health Widget */}
            <GatewayHealthCard />

            {/* Channel Health Widget */}
            <ChannelHealthCard channels={channels} isLoading={isLoading} />

            {/* Sessions & Agents Widget */}
            <SessionsAgentsCard projectId={projectId} />

            {/* Usage & Cost Widget */}
            <UsageCostCard projectId={projectId} />
          </>
        )}
      </div>
    </aside>
  )
}
