"use client"

import { Activity } from "lucide-react"
import { SessionsAgentsCard } from "./sessions-agents-card"
import { ChannelHealthCard, type Channel } from "./channel-health-card"

// Mock channel data - replace with useOpenClawDashboard() hook when available
const MOCK_CHANNELS: Channel[] = [
  { id: "discord", type: "discord", name: "Discord", status: "connected" },
  { id: "telegram", type: "telegram", name: "Telegram", status: "connected" },
  { id: "signal", type: "signal", name: "Signal", status: "disconnected" },
  { id: "clutch", type: "clutch", name: "Clutch", status: "connected" },
  { id: "whatsapp", type: "whatsapp", name: "WhatsApp", status: "connected" },
]

interface OpenClawSidebarProps {
  children?: React.ReactNode
}

export function OpenClawSidebar({ children }: OpenClawSidebarProps) {
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
            {/* Channel Health Widget */}
            <ChannelHealthCard channels={MOCK_CHANNELS} />

            {/* Placeholder widget slots */}
            <SidebarCard title="Gateway Status">
              <p className="text-sm text-[var(--text-muted)]">
                Widget coming soon
              </p>
            </SidebarCard>
            <SessionsAgentsCard />
            <SidebarCard title="System Health">
              <p className="text-sm text-[var(--text-muted)]">
                Widget coming soon
              </p>
            </SidebarCard>
          </>
        )}
      </div>
    </aside>
  )
}

interface SidebarCardProps {
  title: string
  children: React.ReactNode
}

function SidebarCard({ title, children }: SidebarCardProps) {
  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors">
      <div className="px-3 py-2 border-b border-[var(--border)]">
        <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          {title}
        </h3>
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}
