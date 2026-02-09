"use client"

import { useState, useRef, useEffect } from "react"
import {
  ChevronDown,
  ChevronUp,
  Info,
  Bot,
  Cpu,
  Clock,
  Activity,
  Wifi,
  WifiOff,
  ExternalLink,
  AlertTriangle,
  RotateCcw,
  BrainCircuit,
  Coins,
  ArrowRightLeft,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useActiveAgentTasks } from "@/lib/hooks/use-work-loop"
import type { Task } from "@/lib/types"

interface SessionDetails {
  model?: string
  contextPercent?: number
  tokensIn?: number
  tokensOut?: number
  tokensTotal?: number
  cost?: number
  createdAt?: number
  updatedAt?: number
  thinking?: boolean
}

interface SessionInfoDropdownProps {
  sessionKey: string
  projectId?: string
  projectSlug?: string
  sessionDetails?: SessionDetails
  connected: boolean
  gatewayStatus?: {
    startedAt?: string
    uptime?: number
    version?: string
    uptimeString?: string
  }
  onResetSession?: () => void
  onToggleThinking?: () => void
  className?: string
}

// Format token count for display
function formatTokenCount(count?: number): string {
  if (!count) return "0"
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`
  }
  return count.toString()
}

// Format cost for display
function formatCost(cost?: number): string {
  if (!cost) return "$0.00"
  return `$${cost.toFixed(4)}`
}

// Format relative time
function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return "Unknown"

  const now = Date.now()
  const diffMs = now - timestamp
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) return "Just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return `${Math.floor(diffDays / 7)}w ago`
}

// Format duration from start time
function formatDuration(startedAt?: number): string {
  if (!startedAt) return "Unknown"

  const elapsed = Date.now() - startedAt
  const minutes = Math.floor(elapsed / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m`
  return `${Math.floor(elapsed / 1000)}s`
}

// Format short model name
function formatModelShort(model?: string): string {
  if (!model) return "Unknown"

  const lowerModel = model.toLowerCase()

  // Anthropic models
  if (lowerModel.includes('claude-opus-4-6')) return 'Opus 4.6'
  if (lowerModel.includes('claude-opus-4-5')) return 'Opus 4.5'
  if (lowerModel.includes('claude-opus')) return 'Opus'
  if (lowerModel.includes('claude-sonnet-4')) return 'Sonnet 4'
  if (lowerModel.includes('claude-sonnet')) return 'Sonnet'
  if (lowerModel.includes('claude-haiku')) return 'Haiku'
  if (lowerModel.includes('claude')) return 'Claude'

  // Moonshot / Kimi models
  if (lowerModel.includes('kimi-k2-thinking')) return 'Kimi K2 Think'
  if (lowerModel.includes('kimi-k2.5-thinking')) return 'Kimi K2.5 Think'
  if (lowerModel.includes('kimi-k2')) return 'Kimi K2'
  if (lowerModel.includes('kimi-for-coding')) return 'Kimi Code'
  if (lowerModel.includes('kimi')) return 'Kimi'
  if (lowerModel.includes('moonshot')) return 'Moonshot'

  // OpenAI models
  if (lowerModel.includes('gpt-4.5')) return 'GPT-4.5'
  if (lowerModel.includes('gpt-4o')) return 'GPT-4o'
  if (lowerModel.includes('gpt-4-turbo')) return 'GPT-4 Turbo'
  if (lowerModel.includes('gpt-4')) return 'GPT-4'
  if (lowerModel.includes('gpt-3.5-turbo')) return 'GPT-3.5'

  // Google models
  if (lowerModel.includes('gemini-1.5-pro')) return 'Gemini 1.5 Pro'
  if (lowerModel.includes('gemini-1.5-flash')) return 'Gemini 1.5 Flash'
  if (lowerModel.includes('gemini')) return 'Gemini'

  // Z.AI / GLM models
  if (lowerModel.includes('glm-4.5')) return 'GLM-4.5'
  if (lowerModel.includes('glm-4')) return 'GLM-4'
  if (lowerModel.includes('glm')) return 'GLM'

  // Fallback to last part
  const parts = model.split('/')
  return parts[parts.length - 1] || model
}

// Check if agent is stale (>5min no activity)
function isAgentStale(lastActiveAt: number | null | undefined): boolean {
  if (!lastActiveAt) return true
  const fiveMinutes = 5 * 60 * 1000
  return Date.now() - lastActiveAt > fiveMinutes
}

// Get role color for badges
function getRoleColor(role?: string | null): string {
  const colors: Record<string, string> = {
    dev: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    reviewer: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    qa: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    pm: "bg-green-500/20 text-green-400 border-green-500/30",
    research: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    security: "bg-red-500/20 text-red-400 border-red-500/30",
  }
  return colors[role || "dev"] || "bg-gray-500/20 text-gray-400 border-gray-500/30"
}

export function SessionInfoDropdown({
  sessionKey,
  projectId,
  projectSlug,
  sessionDetails,
  connected,
  gatewayStatus,
  onResetSession,
  onToggleThinking,
  className = "",
}: SessionInfoDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Fetch active agents from Convex if projectId is provided
  const { tasks: activeAgents, isLoading: agentsLoading } = useActiveAgentTasks(projectId || null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Extract short session ID for display
  const getShortSessionId = (key: string) => {
    if (key.startsWith('clutch:')) {
      const parts = key.split(':')
      const lastPart = parts[parts.length - 1]
      return lastPart.substring(0, 8)
    }
    return key.substring(0, 8)
  }

  // Check if there are any active agents
  const hasActiveAgents = activeAgents && activeAgents.length > 0

  // Note: Token data now comes from sessions table
  const totalAgentTokens = 0

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-auto px-2 py-1 gap-1.5 text-xs hover:bg-[var(--bg-tertiary)] ${className}`}
      >
        <div className="flex items-center gap-1.5">
          {/* Connection status */}
          {connected ? (
            <Wifi className="h-3 w-3 text-green-500" />
          ) : (
            <WifiOff className="h-3 w-3 text-yellow-500" />
          )}

          {/* Session ID */}
          <span className="font-mono text-blue-400">
            {getShortSessionId(sessionKey)}
          </span>

          {/* Active agents indicator */}
          {hasActiveAgents && (
            <div className="flex items-center gap-0.5">
              <Bot className="h-3 w-3 text-purple-400 animate-pulse" />
              <span className="text-purple-400">{activeAgents.length}</span>
            </div>
          )}

          {/* Thinking indicator */}
          {sessionDetails?.thinking && (
            <BrainCircuit className="h-3 w-3 text-amber-400" />
          )}

          {/* Expand indicator */}
          {isOpen ? (
            <ChevronUp className="h-3 w-3 text-[var(--text-muted)]" />
          ) : (
            <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
          )}
        </div>
      </Button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-96 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg shadow-lg z-50 overflow-hidden">

          {/* Current Session Section */}
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 mb-3">
              <Info className="h-4 w-4 text-blue-400" />
              <span className="font-medium">Current Session</span>
              {sessionDetails?.thinking && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-auto border-amber-500/30 text-amber-400">
                  <BrainCircuit className="h-3 w-3 mr-1" />
                  Thinking
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              {/* Session ID */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">Session ID:</span>
                <Link
                  href={`/sessions/${sessionKey}`}
                  className="text-xs font-mono text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
                >
                  {sessionKey}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">Status:</span>
                <div className="flex items-center gap-1">
                  {connected ? (
                    <>
                      <Wifi className="h-3 w-3 text-green-500" />
                      <span className="text-xs text-green-500">Connected</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3 w-3 text-yellow-500" />
                      <span className="text-xs text-yellow-500">Connecting...</span>
                    </>
                  )}
                </div>
              </div>

              {/* Model */}
              {sessionDetails?.model && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">Model:</span>
                  <Badge variant="outline" className="text-xs">
                    {formatModelShort(sessionDetails.model)}
                  </Badge>
                </div>
              )}

              {/* Session Age */}
              {sessionDetails?.createdAt && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">Session Age:</span>
                  <span className="text-xs text-[var(--text-primary)] flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(sessionDetails.createdAt)}
                  </span>
                </div>
              )}

              {/* Last Activity */}
              {sessionDetails?.updatedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">Last Activity:</span>
                  <span className="text-xs text-[var(--text-primary)]">
                    {formatRelativeTime(sessionDetails.updatedAt)}
                  </span>
                </div>
              )}

              {/* Token Usage */}
              {(sessionDetails?.tokensTotal || sessionDetails?.tokensIn || sessionDetails?.tokensOut) && (
                <div className="pt-2 border-t border-[var(--border)]/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[var(--text-muted)]">Token Usage:</span>
                    <span className="text-xs font-mono text-[var(--text-primary)]">
                      {formatTokenCount(sessionDetails.tokensTotal || (sessionDetails.tokensIn || 0) + (sessionDetails.tokensOut || 0))}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                    <span className="flex items-center gap-1">
                      <ArrowRightLeft className="h-3 w-3 text-blue-400" />
                      In: {formatTokenCount(sessionDetails.tokensIn)}
                    </span>
                    <span className="flex items-center gap-1">
                      <ArrowRightLeft className="h-3 w-3 text-green-400 rotate-180" />
                      Out: {formatTokenCount(sessionDetails.tokensOut)}
                    </span>
                    {sessionDetails.contextPercent !== undefined && (
                      <span className={`${sessionDetails.contextPercent > 80 ? 'text-red-400' : sessionDetails.contextPercent > 50 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {sessionDetails.contextPercent}% context
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Cost Estimate */}
              {sessionDetails?.cost !== undefined && sessionDetails.cost > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">Est. Cost:</span>
                  <span className="text-xs text-[var(--text-primary)] flex items-center gap-1">
                    <Coins className="h-3 w-3 text-yellow-400" />
                    {formatCost(sessionDetails.cost)}
                  </span>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-[var(--border)]">
              {onResetSession && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onResetSession()
                    setIsOpen(false)
                  }}
                  className="flex-1 h-7 text-xs"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
              )}
              {onToggleThinking && (
                <Button
                  variant={sessionDetails?.thinking ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    onToggleThinking()
                    setIsOpen(false)
                  }}
                  className={`flex-1 h-7 text-xs ${sessionDetails?.thinking ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border-amber-500/30' : ''}`}
                >
                  <BrainCircuit className="h-3 w-3 mr-1" />
                  {sessionDetails?.thinking ? 'Thinking On' : 'Thinking'}
                </Button>
              )}
            </div>
          </div>

          {/* Active Agents Section */}
          {projectId && (
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="h-4 w-4 text-purple-400" />
                <span className="font-medium">Project Agents</span>
                {hasActiveAgents && (
                  <Badge variant="secondary" className="text-xs">
                    {activeAgents.length}
                  </Badge>
                )}
                {totalAgentTokens > 0 && (
                  <span className="text-xs text-[var(--text-muted)] ml-auto">
                    {formatTokenCount(totalAgentTokens)} tokens
                  </span>
                )}
              </div>

              {agentsLoading ? (
                <div className="h-16 bg-[var(--bg-secondary)]/50 rounded animate-pulse" />
              ) : hasActiveAgents ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {activeAgents.map((agent: Task) => {
                    // Note: Agent details now in sessions table
                    return (
                      <div
                        key={agent.id}
                        className="p-2 rounded bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-tertiary)] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <Link
                              href={projectSlug ? `/projects/${projectSlug}/board?task=${agent.id}` : '#'}
                              className="font-medium text-sm hover:text-[var(--accent-blue)] truncate block"
                              title={agent.title}
                            >
                              {agent.title}
                            </Link>
                          </div>
                          {/* Staleness now tracked in sessions table */}
                        </div>

                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1 py-0 h-auto ${getRoleColor(agent.role)}`}
                          >
                            {agent.role || 'dev'}
                          </Badge>
                          {/* Model info now in sessions table */}
                        </div>

                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[var(--text-muted)]">
                          {/* Agent timing now in sessions table */}
                          <span className="flex items-center gap-1 text-green-400">
                            <Activity className="h-3 w-3" />
                            Active
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-4 text-sm text-[var(--text-muted)]">
                  No active agents for this project
                </div>
              )}
            </div>
          )}

          {/* Gateway Status */}
          {gatewayStatus && (
            <div className="px-4 py-2 bg-[var(--bg-secondary)]/30">
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>OpenClaw Gateway</span>
                <div className="flex items-center gap-2">
                  {gatewayStatus.version && (
                    <span className="font-mono">v{gatewayStatus.version}</span>
                  )}
                  {gatewayStatus.uptimeString && (
                    <span className="text-green-400">{gatewayStatus.uptimeString}</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
