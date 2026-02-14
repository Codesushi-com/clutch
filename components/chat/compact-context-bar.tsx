"use client"

import { useSession } from "@/lib/hooks/use-sessions"

interface CompactContextBarProps {
  sessionKey?: string
}

// Format token count (e.g. 42000 -> "42k")
function formatTokenCount(count: number | null | undefined): string {
  if (!count) return "0"
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
  return count.toString()
}

// Get color for progress bar based on token usage
function getProgressColor(percentage: number): string {
  if (percentage < 50) return "bg-green-500"
  if (percentage < 80) return "bg-yellow-500"
  return "bg-red-500"
}

// Get model-specific context window size (rough estimates)
function getContextWindow(model?: string | null): number {
  if (!model) return 200000 // Default

  const modelLower = model.toLowerCase()

  // Claude models
  if (modelLower.includes("claude-opus-4-6")) return 200000
  if (modelLower.includes("claude-opus")) return 200000
  if (modelLower.includes("claude-sonnet-4")) return 200000
  if (modelLower.includes("claude-sonnet")) return 200000
  if (modelLower.includes("claude-haiku")) return 200000

  // GPT models
  if (modelLower.includes("gpt-4o")) return 128000
  if (modelLower.includes("gpt-4.5")) return 128000
  if (modelLower.includes("gpt-4")) return 8192

  // Gemini models
  if (modelLower.includes("gemini-1.5-pro")) return 2000000
  if (modelLower.includes("gemini-1.5")) return 1000000
  if (modelLower.includes("gemini")) return 1000000

  // Kimi models
  if (modelLower.includes("kimi-k2")) return 256000
  if (modelLower.includes("kimi")) return 200000

  // GLM models
  if (modelLower.includes("glm-4")) return 128000
  if (modelLower.includes("glm")) return 32000

  return 200000 // Default fallback
}

// Format short model name
function formatModelShort(model?: string | null): string {
  if (!model) return "Unknown"
  
  const parts = model.split("/")
  const shortName = parts[parts.length - 1]
  
  // Further shorten common models
  if (shortName.includes("claude-opus")) return "Opus"
  if (shortName.includes("claude-sonnet")) return "Sonnet"
  if (shortName.includes("claude-haiku")) return "Haiku"
  if (shortName.includes("gpt-4o")) return "GPT-4o"
  if (shortName.includes("gpt-4.5")) return "GPT-4.5"
  if (shortName.includes("kimi-k2")) return "Kimi K2"
  if (shortName.includes("kimi")) return "Kimi"
  if (shortName.includes("glm")) return "GLM"
  
  return shortName
}

export function CompactContextBar({ sessionKey = "main" }: CompactContextBarProps) {
  const { session, isLoading } = useSession(sessionKey)

  // Show placeholder when no session exists yet
  if (!session && !isLoading) {
    return (
      <div className="px-3 py-1.5 flex items-center gap-2 text-[10px] text-[var(--text-muted)]/50">
        <span className="font-mono text-[var(--text-muted)]/40">No session</span>
        <div className="flex-1 h-1 bg-[var(--border)] rounded-full overflow-hidden">
          <div className="h-full bg-green-500" style={{ width: '0%' }} />
        </div>
        <span>0%</span>
      </div>
    )
  }

  const tokens = session?.tokens_total ?? 0
  const model = session?.model

  // Use model-specific context window
  const contextWindow = getContextWindow(model)
  const percentage = contextWindow > 0 ? Math.round((tokens / contextWindow) * 100) : 0

  // Short model name for display
  const displayModel = formatModelShort(model)

  return (
    <div className="px-3 py-1.5 flex items-center gap-2 text-[10px]">
      {/* Model name */}
      <span className="font-mono text-[var(--text-muted)] truncate max-w-[80px]">
        {displayModel}
      </span>

      {/* Progress bar */}
      <div className="flex-1 h-1 bg-[var(--border)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${getProgressColor(percentage)}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      {/* Percentage */}
      <span className={`font-medium ${
        percentage > 80 ? 'text-red-500' : percentage > 50 ? 'text-yellow-500' : 'text-green-500'
      }`}>
        {percentage}%
      </span>

      {/* Token count (compact) */}
      <span className="text-[var(--text-muted)]/70">
        {formatTokenCount(tokens)}
      </span>

      {isLoading && (
        <span className="text-[var(--text-muted)]/50">...</span>
      )}
    </div>
  )
}