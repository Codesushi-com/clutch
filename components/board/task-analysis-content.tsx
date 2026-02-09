"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, AlertCircle, CheckCircle2, MinusCircle, XCircle, FileText, ExternalLink } from "lucide-react"
import Link from "next/link"

type Outcome = "success" | "failure" | "partial" | "abandoned"

interface TaskAnalysisProps {
  taskId: string
  projectSlug: string
}

const OUTCOME_CONFIG: Record<Outcome, { label: string; color: string; icon: React.ReactNode }> = {
  success: {
    label: "Success",
    color: "#22c55e",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  failure: {
    label: "Failure",
    color: "#ef4444",
    icon: <XCircle className="h-4 w-4" />,
  },
  partial: {
    label: "Partial",
    color: "#eab308",
    icon: <MinusCircle className="h-4 w-4" />,
  },
  abandoned: {
    label: "Abandoned",
    color: "#6b7280",
    icon: <AlertCircle className="h-4 w-4" />,
  },
}

function formatDuration(ms: number | null): string {
  if (!ms) return "N/A"
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

function formatTokens(count: number | null): string {
  if (!count) return "N/A"
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`
  }
  return count.toString()
}

function ConfidenceMeter({ confidence }: { confidence: number }) {
  const percentage = Math.round(confidence * 100)
  let color = "#ef4444"
  if (percentage >= 70) color = "#22c55e"
  else if (percentage >= 40) color = "#eab308"
  
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-sm font-medium text-[var(--text-secondary)] w-12 text-right">
        {percentage}%
      </span>
    </div>
  )
}

function AmendmentCard({ amendment, index }: { amendment: string; index: number }) {
  // Parse amendment format: "action: location: suggestion"
  // Expected format: "add|remove|rephrase: section: text"
  const parts = amendment.split(":", 2)
  const action = parts[0]?.trim().toLowerCase() || "unknown"
  const rest = parts[1] || amendment
  
  const actionColors: Record<string, string> = {
    add: "#22c55e",
    remove: "#ef4444",
    rephrase: "#eab308",
    unknown: "#6b7280",
  }
  
  return (
    <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--bg-primary)]">
      <div className="flex items-center gap-2 mb-3">
        <Badge
          style={{
            backgroundColor: `${actionColors[action]}20`,
            color: actionColors[action],
            borderColor: actionColors[action],
          }}
          variant="outline"
        >
          {action.charAt(0).toUpperCase() + action.slice(1)}
        </Badge>
        <span className="text-xs text-[var(--text-muted)]">Amendment #{index + 1}</span>
      </div>
      <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap font-mono bg-[var(--bg-secondary)] p-3 rounded">
        {rest}
      </p>
      <div className="mt-3 flex justify-end">
        <button
          disabled
          className="px-3 py-1.5 text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-muted)] rounded cursor-not-allowed"
          title="Apply functionality coming in Phase 3"
        >
          Apply
        </button>
      </div>
    </div>
  )
}

function FailureModeBadge({ mode }: { mode: string }) {
  // Common failure mode categories
  const categoryColors: Record<string, string> = {
    "missing_context": "#ef4444",
    "wrong_assumption": "#f97316",
    "incomplete_implementation": "#eab308",
    "scope_creep": "#8b5cf6",
    "technical_error": "#3b82f6",
    "dependency_issue": "#06b6d4",
    "misunderstood_requirements": "#ec4899",
    "unknown": "#6b7280",
  }
  
  const normalizedMode = mode.toLowerCase().replace(/\s+/g, "_")
  const color = categoryColors[normalizedMode] || "#6b7280"
  
  return (
    <Badge
      style={{
        backgroundColor: `${color}20`,
        color: color,
        borderColor: color,
      }}
      variant="outline"
      className="text-xs"
    >
      {mode}
    </Badge>
  )
}

export function TaskAnalysisContent({ taskId, projectSlug }: TaskAnalysisProps) {
  const analysis = useQuery(api.taskAnalyses.getByTask, { task_id: taskId })
  
  if (analysis === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        <span className="ml-2 text-sm text-[var(--text-muted)]">Loading analysis...</span>
      </div>
    )
  }
  
  if (analysis === null) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="h-12 w-12 text-[var(--text-muted)] mb-4" />
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
          No Analysis Available
        </h3>
        <p className="text-sm text-[var(--text-secondary)] max-w-md">
          This task has not been analyzed yet. Analysis is performed after a task completes
          to identify failure modes and suggest prompt improvements.
        </p>
      </div>
    )
  }
  
  const outcome = OUTCOME_CONFIG[analysis.outcome as Outcome]
  
  return (
    <div className="space-y-6">
      {/* Header with outcome badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
            style={{ backgroundColor: `${outcome.color}20`, color: outcome.color }}
          >
            {outcome.icon}
            {outcome.label}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            Analyzed {new Date(analysis.analyzed_at).toLocaleString()}
          </span>
        </div>
        <Link
          href={`/projects/${projectSlug}/prompt-lab`}
          className="text-xs text-[var(--accent-blue)] hover:underline"
        >
          View in Prompt Lab →
        </Link>
      </div>
      
      {/* Summary */}
      <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg p-4">
        <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Summary</h4>
        <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
          {analysis.analysis_summary}
        </p>
      </div>
      
      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg p-4">
          <span className="text-xs text-[var(--text-muted)] block mb-1">Duration</span>
          <span className="text-lg font-medium text-[var(--text-primary)]">
            {formatDuration(analysis.duration_ms)}
          </span>
        </div>
        <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg p-4">
          <span className="text-xs text-[var(--text-muted)] block mb-1">Tokens Used</span>
          <span className="text-lg font-medium text-[var(--text-primary)]">
            {formatTokens(analysis.token_count)}
          </span>
        </div>
        <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg p-4">
          <span className="text-xs text-[var(--text-muted)] block mb-1">Model</span>
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
            {analysis.model}
          </span>
        </div>
      </div>
      
      {/* Confidence meter */}
      <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-[var(--text-secondary)]">Analyzer Confidence</h4>
          <span className="text-xs text-[var(--text-muted)]">Role: {analysis.role}</span>
        </div>
        <ConfidenceMeter confidence={analysis.confidence} />
      </div>
      
      {/* Failure modes */}
      {analysis.failure_modes && analysis.failure_modes.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
            Failure Modes ({analysis.failure_modes.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {analysis.failure_modes.map((mode: string, idx: number) => (
              <FailureModeBadge key={idx} mode={mode} />
            ))}
          </div>
        </div>
      )}
      
      {/* Suggested amendments */}
      {analysis.amendments && analysis.amendments.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
            Suggested Amendments ({analysis.amendments.length})
          </h4>
          <div className="space-y-3">
            {analysis.amendments.map((amendment: string, idx: number) => (
              <AmendmentCard key={idx} amendment={amendment} index={idx} />
            ))}
          </div>
        </div>
      )}
      
      {/* Footer info */}
      <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--text-muted)]">
            Session: {analysis.session_key || "N/A"}
          </span>
          {analysis.session_key && (
            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-7 text-xs"
            >
              <Link
                href={`/projects/${projectSlug}/sessions/${encodeURIComponent(analysis.session_key)}?task=${taskId}`}
                className="flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                View Log
              </Link>
            </Button>
          )}
        </div>
        <Link
          href={`/projects/${projectSlug}/prompt-lab?version=${analysis.prompt_version_id}`}
          className="text-xs text-[var(--accent-blue)] hover:underline"
        >
          Prompt Version: {analysis.prompt_version_id.substring(0, 8)}
        </Link>
      </div>
    </div>
  )
}
