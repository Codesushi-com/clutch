"use client"

import { useState, useEffect } from "react"
import { 
  Settings, 
  Server, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Info,
  ExternalLink,
  AlertCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

interface OpenClawStatus {
  status: ConnectionStatus
  connected: boolean
  wsUrl: string
  error?: string
}

export default function SettingsPage() {
  const [openclawStatus, setOpenclawStatus] = useState<OpenClawStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [reconnecting, setReconnecting] = useState(false)
  const [appVersion] = useState("1.0.0")
  const githubUrl = process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/dbachelder/clutch"

  // Fetch OpenClaw connection status
  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/openclaw/status')
      if (response.ok) {
        const data = await response.json()
        setOpenclawStatus(data)
      } else {
        setOpenclawStatus({
          status: 'error',
          connected: false,
          wsUrl: 'ws://127.0.0.1:4440/ws',
          error: 'Failed to fetch status'
        })
      }
    } catch (error) {
      setOpenclawStatus({
        status: 'error',
        connected: false,
        wsUrl: 'ws://127.0.0.1:4440/ws',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    // Poll status every 5 seconds
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleReconnect = async () => {
    setReconnecting(true)
    try {
      const response = await fetch('/api/openclaw/status', { method: 'POST' })
      if (response.ok) {
        // Wait a moment then refresh status
        setTimeout(fetchStatus, 1000)
      }
    } catch (error) {
      console.error('Failed to reconnect:', error)
    } finally {
      setTimeout(() => setReconnecting(false), 1000)
    }
  }

  const getStatusIcon = () => {
    if (loading) return <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
    if (openclawStatus?.connected) return <CheckCircle2 className="h-5 w-5 text-green-500" />
    return <XCircle className="h-5 w-5 text-red-500" />
  }

  const getStatusText = () => {
    if (loading) return "Checking..."
    if (openclawStatus?.connected) return "Connected"
    return openclawStatus?.status === 'reconnecting' ? "Reconnecting..." : "Disconnected"
  }

  const getStatusColor = () => {
    if (loading) return "bg-gray-100 text-gray-600"
    if (openclawStatus?.connected) return "bg-green-50 text-green-700 border-green-200"
    return "bg-red-50 text-red-700 border-red-200"
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2 flex items-center gap-3">
          <Settings className="h-6 w-6" />
          Settings
        </h1>
        <p className="text-[var(--text-secondary)]">
          Configure global application settings and connections
        </p>
      </div>

      {/* OpenClaw Connection */}
      <Card className="border-[var(--border)] bg-[var(--bg-secondary)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-[var(--text-primary)]" />
            <CardTitle className="text-[var(--text-primary)]">OpenClaw Connection</CardTitle>
          </div>
          <CardDescription className="text-[var(--text-secondary)]">
            Connection to the OpenClaw gateway for agent communication
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Display */}
          <div className={cn(
            "flex items-center justify-between p-4 rounded-lg border",
            getStatusColor()
          )}>
            <div className="flex items-center gap-3">
              {getStatusIcon()}
              <div>
                <p className="font-medium">{getStatusText()}</p>
                <p className="text-sm opacity-80">
                  {openclawStatus?.wsUrl || 'ws://127.0.0.1:4440/ws'}
                </p>
              </div>
            </div>
            {!openclawStatus?.connected && !loading && (
              <Button
                onClick={handleReconnect}
                disabled={reconnecting || openclawStatus?.status === 'reconnecting'}
                variant="outline"
                size="sm"
                className="shrink-0"
              >
                {reconnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Reconnect
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Status Details */}
          {openclawStatus?.error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 border border-orange-200">
              <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-orange-800">Connection Error</p>
                <p className="text-sm text-orange-700 mt-1">{openclawStatus.error}</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium text-[var(--text-primary)]">
              Gateway URL
            </Label>
            <p className="text-sm text-[var(--text-secondary)]">
              {openclawStatus?.wsUrl || 'ws://127.0.0.1:4440/ws'}
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">
              Configured via OPENCLAW_WS_URL environment variable
            </p>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card className="border-[var(--border)] bg-[var(--bg-secondary)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-[var(--text-primary)]" />
            <CardTitle className="text-[var(--text-primary)]">About</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-sm font-medium text-[var(--text-primary)]">Version</Label>
            <p className="text-sm text-[var(--text-secondary)]">{appVersion}</p>
          </div>
          
          <div className="space-y-1">
            <Label className="text-sm font-medium text-[var(--text-primary)]">Description</Label>
            <p className="text-sm text-[var(--text-secondary)]">
              OpenClutch — AI Agent Dashboard for OpenClaw
            </p>
          </div>

          <div className="pt-2">
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 hover:underline"
            >
              View on GitHub
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
