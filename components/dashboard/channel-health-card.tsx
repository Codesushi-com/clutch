"use client"

import { MessageCircle, Send, Shield, Cpu, Phone, CheckCircle2, XCircle, AlertCircle } from "lucide-react"

export type ChannelType = "discord" | "telegram" | "signal" | "clutch" | "whatsapp"

export type ChannelStatus = "connected" | "disconnected" | "degraded"

export interface Channel {
  id: string
  type: ChannelType
  name: string
  status: ChannelStatus
}

interface ChannelHealthCardProps {
  channels?: Channel[]
  isLoading?: boolean
}

const CHANNEL_CONFIG: Record<ChannelType, { icon: React.ElementType; label: string }> = {
  discord: { icon: MessageCircle, label: "Discord" },
  telegram: { icon: Send, label: "Telegram" },
  signal: { icon: Shield, label: "Signal" },
  clutch: { icon: Cpu, label: "Clutch" },
  whatsapp: { icon: Phone, label: "WhatsApp" },
}

const STATUS_CONFIG: Record<ChannelStatus, { icon: React.ElementType; colorClass: string; bgClass: string }> = {
  connected: { icon: CheckCircle2, colorClass: "text-emerald-500", bgClass: "bg-emerald-500/10" },
  disconnected: { icon: XCircle, colorClass: "text-red-500", bgClass: "bg-red-500/10" },
  degraded: { icon: AlertCircle, colorClass: "text-amber-500", bgClass: "bg-amber-500/10" },
}

export function ChannelHealthCard({ channels = [], isLoading }: ChannelHealthCardProps) {
  const connectedCount = channels.filter((c) => c.status === "connected").length
  const totalCount = channels.length
  const hasIssues = connectedCount < totalCount

  if (isLoading) {
    return (
      <div className="border border-[var(--border)] rounded-lg bg-[var(--bg-primary)]">
        <div className="px-3 py-2 border-b border-[var(--border)]">
          <div className="h-3 w-24 bg-muted rounded animate-pulse" />
        </div>
        <div className="p-3 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-muted animate-pulse" />
              <div className="h-3 w-20 bg-muted rounded animate-pulse" />
              <div className="ml-auto h-3 w-16 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Empty state - no channels configured
  if (channels.length === 0) {
    return (
      <div className="border border-[var(--border)] rounded-lg bg-[var(--bg-primary)]">
        <div className="px-3 py-2 border-b border-[var(--border)]">
          <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
            Channel Health
          </h3>
        </div>
        <div className="p-3">
          <p className="text-sm text-[var(--text-muted)]">
            No channels configured
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--bg-primary)]">
      {/* Header with count */}
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
        <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Channel Health
        </h3>
        <span
          className={`text-xs font-medium ${
            hasIssues ? "text-amber-500" : "text-emerald-500"
          }`}
        >
          {connectedCount}/{totalCount} connected
        </span>
      </div>

      {/* Channel list */}
      <div className="p-2">
        <div className="space-y-0.5">
          {channels.map((channel) => {
            const config = CHANNEL_CONFIG[channel.type]
            const statusConfig = STATUS_CONFIG[channel.status]
            const Icon = config.icon
            const StatusIcon = statusConfig.icon

            return (
              <div
                key={channel.id}
                className="flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <Icon className="w-4 h-4 text-[var(--text-muted)]" />
                <span
                  className={`text-sm ${
                    channel.status === "disconnected"
                      ? "text-red-500 font-medium"
                      : "text-[var(--text-primary)]"
                  }`}
                >
                  {channel.name}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  {channel.status === "disconnected" ? (
                    <>
                      <StatusIcon className={`w-3.5 h-3.5 ${statusConfig.colorClass}`} />
                      <span className={`text-xs ${statusConfig.colorClass}`}>
                        disconnected
                      </span>
                    </>
                  ) : channel.status === "degraded" ? (
                    <>
                      <StatusIcon className={`w-3.5 h-3.5 ${statusConfig.colorClass}`} />
                      <span className={`text-xs ${statusConfig.colorClass}`}>
                        degraded
                      </span>
                    </>
                  ) : (
                    <div
                      className="w-2 h-2 rounded-full bg-emerald-500/60"
                      title="Connected"
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
