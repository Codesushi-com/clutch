"use client"

import { useSession } from "@/lib/hooks/use-sessions"

interface ContextIndicatorProps {
  sessionKey?: string
  projectId?: string
}

// Format token count (e.g., 42000 -> "42k")
function formatTokenCount(count: number | null | undefined): string {
  if (!count) return "0"
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
  return count.toString()
}

// Format cost (e.g., 0.00123 -> "$0.001")
function formatCost(cost: number | null | undefined): string {
  if (!cost) return "$0"
  if (cost >= 1) return `$${cost.toFixed(2)}`
  if (cost >= 0.01) return `$${cost.toFixed(3)}`
  return `$${cost.toFixed(4)}`
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

export function ContextIndicator({
  sessionKey = "main",
}: ContextIndicatorProps) {
  // Subscribe directly to Convex sessions table
  const { session, isLoading } = useSession(sessionKey)

  if (!session && !isLoading) {
    return null
  }

  const tokens = session?.tokens_total ?? 0
  const tokensInput = session?.tokens_input ?? 0
  const tokensOutput = session?.tokens_output ?? 0
  const tokensCacheRead = session?.tokens_cache_read ?? 0
  const tokensCacheWrite = session?.tokens_cache_write ?? 0
  const cost = session?.cost_total
  const model = session?.model
  const provider = session?.provider

  // Use model-specific context window
  const contextWindow = getContextWindow(model)
  const percentage = contextWindow > 0 ? Math.round((tokens / contextWindow) * 100) : 0

  // Short model name for display
  const displayModel = model?.split("/").pop() || model

  return (
    <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
      {/* Compact single-line layout */}
      <span className="font-medium">{formatTokenCount(tokens)}</span>

      {/* Progress bar */}
      {contextWindow > 0 && (
        <div className="w-12 h-1 bg-[var(--border)] rounded-full overflow-hidden flex-shrink-0">
          <div
            className={`h-full rounded-full transition-all ${getProgressColor(percentage)}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      )}

      <span className="text-[var(--text-muted)]/70">
        {percentage}% · In {formatTokenCount(tokensInput)} · Out {formatTokenCount(tokensOutput)}
        {(tokensCacheRead > 0 || tokensCacheWrite > 0) && (
          <span> · Cache +{formatTokenCount(tokensCacheRead)}/-{formatTokenCount(tokensCacheWrite)}</span>
        )}
        {cost && cost > 0 && (
          <span className="text-green-500/80"> · {formatCost(cost)}</span>
        )}
      </span>

      <span className="text-[var(--text-muted)]/50">
        ·
      </span>

      {/* Model info - compact */}
      {(displayModel || provider) && (
        <span className="text-[var(--text-muted)]/60 font-mono truncate max-w-[120px]">
          {provider && `${provider}/`}{displayModel}
        </span>
      )}

      {isLoading && (
        <span className="text-[var(--text-muted)]/50">loading...</span>
      )}
    </div>
  )
}
