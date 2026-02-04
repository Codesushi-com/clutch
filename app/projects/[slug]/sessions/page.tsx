"use client"

import { useEffect, useState, use, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Activity, RefreshCw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useOpenClawRpc } from "@/lib/hooks/use-openclaw-rpc"
import { formatDistanceToNow } from "date-fns"

type PageProps = {
  params: Promise<{ slug: string }>
}

export default function ProjectSessionsPage({ params }: PageProps) {
  const { slug } = use(params)
  const router = useRouter()
  const { connected, connecting, listSessions } = useOpenClawRpc()
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSessions = useCallback(async () => {
    if (!connected) return
    
    try {
      const response = await listSessions({ limit: 10 })
      setSessions(response.sessions || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }, [connected, listSessions])

  useEffect(() => {
    if (connected) {
      fetchSessions()
      
      // Auto-refresh every 10 seconds
      refreshIntervalRef.current = setInterval(fetchSessions, 10000)
    }
    
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [connected, fetchSessions])

  const formatTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toString()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <h2 className="text-xl font-semibold">OpenClaw Sessions</h2>
          <span className={`px-2 py-0.5 text-xs rounded-full ${
            connected ? 'bg-green-500/20 text-green-400' : 
            connecting ? 'bg-yellow-500/20 text-yellow-400' : 
            'bg-red-500/20 text-red-400'
          }`}>
            {connected ? 'Connected' : connecting ? 'Connecting...' : 'Disconnected'}
          </span>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchSessions}
          disabled={!connected || loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Sessions List */}
      {!loading && sessions.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No sessions found
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <div className="space-y-2">
          {sessions.map((session, index) => {
            const sessionKey = session.id || `session-${index}`
            return (
              <div 
                key={sessionKey}
                onClick={() => router.push(`/projects/${slug}/sessions/${encodeURIComponent(sessionKey)}`)}
                className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    router.push(`/projects/${slug}/sessions/${encodeURIComponent(sessionKey)}`)
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {session.name || session.id}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {session.model || 'unknown model'} · {formatTokens(session.tokens?.total || 0)} tokens
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {session.updatedAt ? formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true }) : '—'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
