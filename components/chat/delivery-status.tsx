"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2, Check, X, RotateCcw } from "lucide-react"
import type { DeliveryStatus, ChatMessage } from "@/lib/types"

interface DeliveryStatusIndicatorProps {
  status?: DeliveryStatus
  sentAt?: number | null
  deliveredAt?: number | null
  failureReason?: string | null
  onRetry?: () => void
  hasResponse?: boolean  // True if agent has responded (to fade out indicator)
}

export function DeliveryStatusIndicator({
  status,
  sentAt,
  deliveredAt,
  failureReason,
  onRetry,
  hasResponse = false,
}: DeliveryStatusIndicatorProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [isFading, setIsFading] = useState(false)

  // Fade out indicators after response arrives
  useEffect(() => {
    if (hasResponse && status && status !== "failed") {
      const fadeTimer = setTimeout(() => {
        setIsFading(true)
        setTimeout(() => setIsVisible(false), 500) // Wait for fade animation
      }, 5000) // 5 seconds after response arrives

      return () => clearTimeout(fadeTimer)
    }
  }, [hasResponse, status])

  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry()
    }
  }, [onRetry])

  if (!isVisible || !status) {
    return null
  }

  const baseClasses = `
    flex items-center gap-1.5 text-xs mt-1 ml-auto w-fit
    transition-opacity duration-500
    ${isFading ? "opacity-0" : "opacity-100"}
    ${status === "failed" ? "text-red-500" : "text-muted-foreground"}
  `

  switch (status) {
    case "sending":
      return (
        <div className={baseClasses}>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="text-[var(--text-muted)]">Sending...</span>
        </div>
      )

    case "sent":
      return (
        <div className={baseClasses}>
          <Check className="h-3 w-3 text-[var(--text-muted)]" />
          <span className="text-[var(--text-muted)]">Sent</span>
          {deliveredAt && sentAt && (
            <span className="text-[10px] text-[var(--text-muted)]/60">
              ({Math.round((deliveredAt - sentAt) / 100)}ms)
            </span>
          )}
        </div>
      )

    case "processing":
      return (
        <div className={baseClasses}>
          <div className="flex">
            <Check className="h-3 w-3 text-blue-500" />
            <Check className="h-3 w-3 text-blue-500 -ml-1.5" />
          </div>
          <span className="text-blue-500">Processing</span>
        </div>
      )

    case "failed":
      return (
        <div className={baseClasses}>
          <X className="h-3 w-3 text-red-500" />
          <span className="text-red-500">Failed</span>
          {failureReason && (
            <span className="text-[10px] text-red-400/80 max-w-[200px] truncate" title={failureReason}>
              {failureReason}
            </span>
          )}
          {onRetry && (
            <button
              onClick={handleRetry}
              className="flex items-center gap-1 text-blue-500 hover:text-blue-600 hover:underline ml-1"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          )}
        </div>
      )

    default:
      return null
  }
}

// Hook to track if a response has arrived for a given message
export function useHasResponse(
  messages: ChatMessage[],
  messageIndex: number
): boolean {
  // A response has arrived if there's a message after this one from a different author
  // that was created after this message
  if (messageIndex >= messages.length - 1) return false

  const currentMessage = messages[messageIndex]
  if (!currentMessage) return false

  // Look for any message after this one from a different author
  for (let i = messageIndex + 1; i < messages.length; i++) {
    const nextMessage = messages[i]
    if (
      nextMessage &&
      nextMessage.author !== currentMessage.author &&
      nextMessage.author !== "system" &&
      nextMessage.created_at >= currentMessage.created_at
    ) {
      return true
    }
  }

  return false
}