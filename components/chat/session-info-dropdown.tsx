"use client"

import { useState, useRef, useEffect } from "react"
import { ChevronDown, ChevronUp, Info, Bot, Timer, Cpu, Clock, Activity, Wifi, WifiOff, ExternalLink } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface SubAgentDetails {
  key: string
  label?: string
  model?: string
  status?: string
  agentId?: string
  createdAt?: number
  updatedAt?: number
  runtime?: string
  isCron?: boolean
}

interface SessionInfoDropdownProps {
  sessionKey: string
  sessionInfo?: {
    model?: string
    contextPercent?: number
  }
  connected: boolean
  activeSubagents: SubAgentDetails[]
  activeCrons: SubAgentDetails[]
  className?: string
}

export function SessionInfoDropdown({
  sessionKey,
  sessionInfo,
  connected,
  activeSubagents,
  activeCrons,
  className = "",
}: SessionInfoDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

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

  // Format status for display
  const formatStatus = (status?: string) => {
    switch (status) {
      case 'running': return 'Running'
      case 'idle': return 'Idle'
      case 'completed': return 'Completed'
      case 'error': return 'Error'
      case 'cancelled': return 'Cancelled'
      default: return 'Unknown'
    }
  }

  // Format model for display (show short name)
  const formatModel = (model?: string) => {
    if (!model) return 'Unknown'
    
    // Extract short names from common model formats
    if (model.includes('claude')) {
      if (model.includes('haiku')) return 'Haiku'
      if (model.includes('sonnet')) return 'Sonnet'
      if (model.includes('opus')) return 'Opus'
      return 'Claude'
    }
    if (model.includes('kimi')) return 'Kimi'
    if (model.includes('moonshot')) return 'Moonshot'
    if (model.includes('gpt')) return 'GPT'
    
    // Fallback to last part of model name
    const parts = model.split('/')
    return parts[parts.length - 1] || model
  }

  // Extract short session ID for display
  const getShortSessionId = (key: string) => {
    if (key.startsWith('trap:')) {
      const id = key.substring(5) // Remove 'trap:' prefix
      return id.substring(0, 8) // Show first 8 characters
    }
    return key.substring(0, 8)
  }

  const hasActiveItems = activeSubagents.length > 0 || activeCrons.length > 0

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-auto px-2 py-1 gap-1.5 text-xs hover:bg-[var(--bg-tertiary)] ${className}`}
      >
        {/* Main indicator */}
        <div className="flex items-center gap-1.5">
          {/* Connection status */}
          {connected ? (
            <Wifi className="h-3 w-3 text-green-500" />
          ) : (
            <WifiOff className="h-3 w-3 text-yellow-500" />
          )}
          
          {/* Session info */}
          <div className="flex items-center gap-1">
            <Info className="h-3 w-3 text-blue-400" />
            <span className="font-mono text-blue-400">
              {getShortSessionId(sessionKey)}
            </span>
          </div>

          {/* Active indicators */}
          {hasActiveItems && (
            <div className="flex items-center gap-1">
              {activeSubagents.length > 0 && (
                <div className="flex items-center gap-0.5">
                  <Bot className="h-3 w-3 text-purple-400 animate-pulse" />
                  <span className="text-purple-400">{activeSubagents.length}</span>
                </div>
              )}
              {activeCrons.length > 0 && (
                <div className="flex items-center gap-0.5">
                  <Timer className="h-3 w-3 text-orange-400" />
                  <span className="text-orange-400">{activeCrons.length}</span>
                </div>
              )}
            </div>
          )}
          
          {/* Expand indicator */}
          {isOpen ? (
            <ChevronUp className="h-3 w-3 text-[var(--text-muted)]" />
          ) : (
            <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
          )}
        </div>
      </Button>

      {/* Custom dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Session Details */}
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 text-blue-400" />
              <span className="font-medium">Session Details</span>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-muted)]">Status:</span>
                <div className="flex items-center gap-1">
                  {connected ? (
                    <>
                      <Wifi className="h-3 w-3 text-green-500" />
                      <span className="text-sm text-green-500">Connected</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3 w-3 text-yellow-500" />
                      <span className="text-sm text-yellow-500">Connecting...</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-muted)]">Session ID:</span>
                <Link 
                  href={`/sessions/${sessionKey}`}
                  className="text-sm font-mono text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
                >
                  {sessionKey}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>

              {sessionInfo?.model && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--text-muted)]">Model:</span>
                  <Badge variant="outline" className="text-xs">
                    {formatModel(sessionInfo.model)}
                  </Badge>
                </div>
              )}

              {sessionInfo?.contextPercent !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--text-muted)]">Context:</span>
                  <span className="text-sm text-[var(--text-primary)]">
                    {sessionInfo.contextPercent}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Sub-Agents */}
          {activeSubagents.length > 0 && (
            <div className="px-3 py-2 border-b border-[var(--border)]">
              <div className="flex items-center gap-2 mb-2">
                <Bot className="h-4 w-4 text-purple-400" />
                <span className="font-medium">Active Sub-Agents ({activeSubagents.length})</span>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-2">
                {activeSubagents.map((agent) => (
                  <div key={agent.key} className="px-2 py-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Bot className="h-3 w-3 text-purple-300 flex-shrink-0" />
                        <span className="font-medium text-sm truncate">
                          {agent.label || agent.key}
                        </span>
                      </div>
                      
                      <div className="ml-5 space-y-0.5">
                        {agent.model && (
                          <div className="flex items-center gap-2 text-xs">
                            <Cpu className="h-3 w-3 text-blue-400 flex-shrink-0" />
                            <span>Model: {formatModel(agent.model)}</span>
                          </div>
                        )}
                        
                        {agent.runtime && (
                          <div className="flex items-center gap-2 text-xs">
                            <Clock className="h-3 w-3 text-green-400 flex-shrink-0" />
                            <span>Runtime: {agent.runtime}</span>
                          </div>
                        )}
                        
                        {agent.status && (
                          <div className="flex items-center gap-2 text-xs">
                            <Activity className="h-3 w-3 text-yellow-400 flex-shrink-0" />
                            <span>Status: {formatStatus(agent.status)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cron Jobs */}
          {activeCrons.length > 0 && (
            <div className="px-3 py-2 border-b border-[var(--border)]">
              <div className="flex items-center gap-2 mb-2">
                <Timer className="h-4 w-4 text-orange-400" />
                <span className="font-medium">Active Cron Jobs ({activeCrons.length})</span>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-2">
                {activeCrons.map((cron) => (
                  <div key={cron.key} className="px-2 py-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Timer className="h-3 w-3 text-orange-300 flex-shrink-0" />
                        <span className="font-medium text-sm truncate">
                          {cron.label || cron.key}
                        </span>
                      </div>
                      
                      <div className="ml-5 space-y-0.5">
                        {cron.model && (
                          <div className="flex items-center gap-2 text-xs">
                            <Cpu className="h-3 w-3 text-blue-400 flex-shrink-0" />
                            <span>Model: {formatModel(cron.model)}</span>
                          </div>
                        )}
                        
                        {cron.runtime && (
                          <div className="flex items-center gap-2 text-xs">
                            <Clock className="h-3 w-3 text-green-400 flex-shrink-0" />
                            <span>Runtime: {cron.runtime}</span>
                          </div>
                        )}
                        
                        {cron.status && (
                          <div className="flex items-center gap-2 text-xs">
                            <Activity className="h-3 w-3 text-yellow-400 flex-shrink-0" />
                            <span>Status: {formatStatus(cron.status)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty states */}
          {!hasActiveItems && (
            <div className="px-3 py-2 text-sm text-[var(--text-muted)] text-center">
              No active sub-agents or cron jobs
            </div>
          )}
        </div>
      )}
    </div>
  )
}