"use client"

import { useState, useEffect, useCallback } from "react"
import { useOpenClawRpc } from "@/lib/hooks/use-openclaw-rpc"
import { SessionPreview } from "@/lib/types"

interface ContextIndicatorProps {
  sessionKey?: string
  onUpdate?: () => void
}

export function ContextIndicator({ 
  sessionKey = "main",
  onUpdate 
}: ContextIndicatorProps) {
  const { connected, getSessionPreview } = useOpenClawRpc()
  const [contextData, setContextData] = useState<{
    percentage: number
    tokens: number
    total: number
    model?: string
  } | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchContextData = useCallback(async () => {
    if (!connected) return
    
    try {
      setLoading(true)
      const preview: SessionPreview = await getSessionPreview(sessionKey, 1) // Only need 1 message for context info
      
      // Calculate actual token counts if available
      const tokens = preview.session.tokens.total
      const percentage = preview.contextPercentage
      
      // Estimate total context window based on percentage
      // If percentage is 0, avoid division by zero
      const total = percentage > 0 ? Math.round(tokens / (percentage / 100)) : 200000 // fallback
      
      setContextData({
        percentage,
        tokens,
        total,
        model: preview.session.model
      })
    } catch (error) {
      console.error("[ContextIndicator] Failed to fetch context:", error)
      setContextData(null)
    } finally {
      setLoading(false)
    }
  }, [connected, getSessionPreview, sessionKey])

  // Initial fetch and periodic updates
  useEffect(() => {
    if (connected) {
      fetchContextData()
      const interval = setInterval(fetchContextData, 10000) // Update every 10 seconds
      return () => clearInterval(interval)
    }
  }, [connected, sessionKey, fetchContextData])

  // Fetch after updates (when onUpdate is called)
  useEffect(() => {
    if (onUpdate) {
      fetchContextData()
    }
  }, [onUpdate, fetchContextData])

  if (!connected || !contextData) {
    return null
  }

  const formatTokens = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`
    }
    return num.toString()
  }

  const getProgressColor = (percentage: number) => {
    if (percentage < 50) return "bg-green-500"
    if (percentage < 80) return "bg-yellow-500"
    return "bg-red-500"
  }

  const displayModel = contextData.model?.split("/").pop() || contextData.model

  return (
    <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
      <div className="flex items-center gap-2">
        <span>Context:</span>
        <span className="font-medium">
          {formatTokens(contextData.tokens)}/{formatTokens(contextData.total)} 
          ({Math.round(contextData.percentage)}%)
        </span>
        
        {/* Progress bar */}
        <div className="w-16 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${getProgressColor(contextData.percentage)}`}
            style={{ width: `${Math.min(contextData.percentage, 100)}%` }}
          />
        </div>
        
        {loading && (
          <span className="text-[var(--text-muted)]/70">updating...</span>
        )}
      </div>
      
      {displayModel && (
        <span className="text-[var(--text-muted)]/70">
          {displayModel}
        </span>
      )}
    </div>
  )
}