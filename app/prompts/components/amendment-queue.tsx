'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit3,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import type { PromptVersion } from '../types'

// ============================================
// Types
// ============================================

interface TaskAnalysis {
  id: string
  task_id: string
  role: string
  model: string
  prompt_version_id: string
  outcome: string
  amendments: string[] | null
  amendment_status: string | null
  analysis_summary: string
  confidence: number
  analyzed_at: number
}

interface ParsedAmendment {
  raw: string
  action: 'add' | 'remove' | 'rephrase' | 'unknown'
  text: string
}

interface GroupedAmendment {
  key: string
  action: 'add' | 'remove' | 'rephrase' | 'unknown'
  text: string
  sources: {
    analysisId: string
    taskId: string
    confidence: number
    analyzedAt: number
  }[]
  role: string
  avgConfidence: number
}

interface AmendmentQueueProps {
  versions: PromptVersion[]
  onVersionCreated: () => void
}

// ============================================
// Helpers
// ============================================

function parseAmendment(raw: string): ParsedAmendment {
  const parts = raw.split(':', 2)
  const actionStr = parts[0]?.trim().toLowerCase() ?? ''
  const text = parts[1]?.trim() ?? raw

  const validActions = ['add', 'remove', 'rephrase'] as const
  const action = validActions.includes(actionStr as typeof validActions[number])
    ? (actionStr as ParsedAmendment['action'])
    : 'unknown'

  return { raw, action, text }
}

function normalizeForGrouping(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

function groupAmendments(analyses: TaskAnalysis[]): GroupedAmendment[] {
  const groups = new Map<string, GroupedAmendment>()

  for (const analysis of analyses) {
    if (!analysis.amendments) continue

    for (const rawAmendment of analysis.amendments) {
      const parsed = parseAmendment(rawAmendment)
      const key = `${analysis.role}:${parsed.action}:${normalizeForGrouping(parsed.text)}`

      const existing = groups.get(key)
      if (existing) {
        existing.sources.push({
          analysisId: analysis.id,
          taskId: analysis.task_id,
          confidence: analysis.confidence,
          analyzedAt: analysis.analyzed_at,
        })
        existing.avgConfidence =
          existing.sources.reduce((sum, s) => sum + s.confidence, 0) / existing.sources.length
      } else {
        groups.set(key, {
          key,
          action: parsed.action,
          text: parsed.text,
          sources: [
            {
              analysisId: analysis.id,
              taskId: analysis.task_id,
              confidence: analysis.confidence,
              analyzedAt: analysis.analyzed_at,
            },
          ],
          role: analysis.role,
          avgConfidence: analysis.confidence,
        })
      }
    }
  }

  // Sort by frequency (most suggested first), then by confidence
  return Array.from(groups.values()).sort((a, b) => {
    if (b.sources.length !== a.sources.length) return b.sources.length - a.sources.length
    return b.avgConfidence - a.avgConfidence
  })
}

// ============================================
// Sub-components
// ============================================

const ACTION_CONFIG = {
  add: { color: '#22c55e', icon: Plus, label: 'Add' },
  remove: { color: '#ef4444', icon: Minus, label: 'Remove' },
  rephrase: { color: '#eab308', icon: Edit3, label: 'Rephrase' },
  unknown: { color: '#6b7280', icon: AlertCircle, label: 'Change' },
} as const

function AmendmentCard({
  group,
  activeVersion,
  onApply,
  onReject,
  onDefer,
  isProcessing,
}: {
  group: GroupedAmendment
  activeVersion: PromptVersion | null
  onApply: (group: GroupedAmendment, editedText?: string) => void
  onReject: (group: GroupedAmendment, reason?: string) => void
  onDefer: (group: GroupedAmendment) => void
  isProcessing: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedText, setEditedText] = useState(group.text)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)

  const config = ACTION_CONFIG[group.action]
  const Icon = config.icon

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-1 p-0.5 rounded hover:bg-[var(--bg-tertiary)]"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge
              variant="outline"
              style={{
                backgroundColor: `${config.color}15`,
                color: config.color,
                borderColor: `${config.color}40`,
              }}
              className="text-xs"
            >
              <Icon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {group.role}
            </Badge>
            {group.sources.length > 1 && (
              <Badge
                variant="outline"
                className="text-xs bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-[var(--accent-blue)]/30"
              >
                ×{group.sources.length} analyses
              </Badge>
            )}
            <span className="text-xs text-[var(--text-muted)] ml-auto">
              {Math.round(group.avgConfidence * 100)}% confidence
            </span>
          </div>

          <p className="text-sm text-[var(--text-primary)]">{group.text}</p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onApply(group)}
            disabled={isProcessing || !activeVersion}
            title="Apply"
            className="text-[var(--accent-green)] hover:text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setIsEditing(true)
              setIsExpanded(true)
            }}
            disabled={isProcessing || !activeVersion}
            title="Edit & Apply"
          >
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setShowRejectInput(true)
              setIsExpanded(true)
            }}
            disabled={isProcessing}
            title="Reject"
            className="text-[var(--accent-red)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10"
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDefer(group)}
            disabled={isProcessing}
            title="Defer"
          >
            <Clock className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-[var(--border)] space-y-3">
          {/* Sources */}
          <div className="pt-3">
            <h4 className="text-xs font-medium text-[var(--text-muted)] mb-2">
              Source analyses ({group.sources.length})
            </h4>
            <div className="space-y-1">
              {group.sources.map((source) => (
                <div
                  key={source.analysisId}
                  className="flex items-center gap-3 text-xs text-[var(--text-secondary)]"
                >
                  <span className="font-mono">{source.taskId.slice(0, 8)}</span>
                  <span>{Math.round(source.confidence * 100)}%</span>
                  <span className="text-[var(--text-muted)]">
                    {format(source.analyzedAt, 'MMM d, HH:mm')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Active version context */}
          {activeVersion && (
            <div className="text-xs text-[var(--text-muted)]">
              Will modify: <span className="font-mono">v{activeVersion.version}</span> (
              {activeVersion.role})
            </div>
          )}

          {/* Edit mode */}
          {isEditing && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Edit suggestion before applying:
              </label>
              <Textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={3}
                className="text-sm"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    onApply(group, editedText)
                    setIsEditing(false)
                  }}
                  disabled={isProcessing || !editedText.trim()}
                >
                  Apply Edited
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsEditing(false)
                    setEditedText(group.text)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Reject reason */}
          {showRejectInput && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Reason for rejection (optional):
              </label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                placeholder="Why is this suggestion not useful?"
                className="text-sm"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    onReject(group, rejectReason || undefined)
                    setShowRejectInput(false)
                    setRejectReason('')
                  }}
                  disabled={isProcessing}
                >
                  Confirm Reject
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowRejectInput(false)
                    setRejectReason('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ============================================
// Main Component
// ============================================

export function AmendmentQueue({ versions, onVersionCreated }: AmendmentQueueProps) {
  const [analyses, setAnalyses] = useState<TaskAnalysis[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [includeDeferred, setIncludeDeferred] = useState(false)

  const fetchAmendments = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/prompts/amendments?includeDeferred=${includeDeferred}`
      )
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setAnalyses(data.analyses)
    } catch (error) {
      console.error('Error fetching amendments:', error)
      toast.error('Failed to load amendments')
    } finally {
      setIsLoading(false)
    }
  }, [includeDeferred])

  useEffect(() => {
    fetchAmendments()
  }, [fetchAmendments])

  const grouped = useMemo(() => groupAmendments(analyses), [analyses])

  // Group by role for section headers
  const byRole = useMemo(() => {
    const map = new Map<string, GroupedAmendment[]>()
    for (const g of grouped) {
      const existing = map.get(g.role) ?? []
      existing.push(g)
      map.set(g.role, existing)
    }
    return map
  }, [grouped])

  const getActiveVersion = useCallback(
    (role: string): PromptVersion | null => {
      return versions.find((v) => v.role === role && v.active) ?? null
    },
    [versions]
  )

  const markAnalyses = async (
    group: GroupedAmendment,
    status: 'applied' | 'rejected' | 'deferred',
    rejectReason?: string
  ) => {
    const ids = group.sources.map((s) => s.analysisId)
    const uniqueIds = [...new Set(ids)]

    setProcessingIds((prev) => {
      const next = new Set(prev)
      for (const id of uniqueIds) next.add(id)
      return next
    })

    try {
      for (const id of uniqueIds) {
        const res = await fetch('/api/prompts/amendments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status, reject_reason: rejectReason }),
        })
        if (!res.ok) throw new Error(`Failed to update ${id}`)
      }
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev)
        for (const id of uniqueIds) next.delete(id)
        return next
      })
    }
  }

  const handleApply = async (group: GroupedAmendment, editedText?: string) => {
    const activeVersion = getActiveVersion(group.role)
    if (!activeVersion) {
      toast.error(`No active prompt version for role: ${group.role}`)
      return
    }

    const amendmentText = editedText ?? group.text
    const action = group.action
    const changeSummary = `${action}: ${amendmentText}`

    // Append the amendment to the current prompt content
    const newContent = applyAmendmentToContent(activeVersion.content, action, amendmentText)

    try {
      // Create a new prompt version with the change
      const res = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: activeVersion.role,
          content: newContent,
          model: activeVersion.model,
          change_summary: changeSummary,
          parent_version_id: activeVersion.id,
          created_by: 'human',
        }),
      })

      if (!res.ok) throw new Error('Failed to create version')

      // Mark source analyses as applied
      await markAnalyses(group, 'applied')

      toast.success(`Created new version for ${group.role} — not yet active`)
      onVersionCreated()
      await fetchAmendments()
    } catch (error) {
      console.error('Error applying amendment:', error)
      toast.error('Failed to apply amendment')
    }
  }

  const handleReject = async (group: GroupedAmendment, reason?: string) => {
    try {
      await markAnalyses(group, 'rejected', reason)
      toast.success('Amendment rejected')
      await fetchAmendments()
    } catch (error) {
      console.error('Error rejecting amendment:', error)
      toast.error('Failed to reject amendment')
    }
  }

  const handleDefer = async (group: GroupedAmendment) => {
    try {
      await markAnalyses(group, 'deferred')
      toast.success('Amendment deferred')
      await fetchAmendments()
    } catch (error) {
      console.error('Error deferring amendment:', error)
      toast.error('Failed to defer amendment')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    )
  }

  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)]">
        <Check className="h-8 w-8 mb-2" />
        <p className="text-sm">No pending amendments</p>
        <p className="text-xs mt-1">Amendments will appear here after task analyses suggest prompt changes</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--text-muted)]">
            {grouped.length} suggestion{grouped.length !== 1 ? 's' : ''} from{' '}
            {analyses.length} analysis{analyses.length !== 1 ? 'es' : ''}
          </span>
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={includeDeferred}
              onChange={(e) => setIncludeDeferred(e.target.checked)}
              className="rounded"
            />
            Show deferred
          </label>
        </div>
        <Button size="sm" variant="ghost" onClick={fetchAmendments}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Grouped by role */}
      {Array.from(byRole.entries()).map(([role, amendments]) => (
        <div key={role}>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <span className="capitalize">{role}</span>
            <Badge variant="outline" className="text-xs">
              {amendments.length}
            </Badge>
          </h3>
          <div className="space-y-2">
            {amendments.map((group) => (
              <AmendmentCard
                key={group.key}
                group={group}
                activeVersion={getActiveVersion(group.role)}
                onApply={handleApply}
                onReject={handleReject}
                onDefer={handleDefer}
                isProcessing={group.sources.some((s) => processingIds.has(s.analysisId))}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Content manipulation
// ============================================

/**
 * Apply an amendment to prompt content.
 * Appends a clearly-marked section so the human can review and refine placement.
 */
function applyAmendmentToContent(
  content: string,
  action: string,
  text: string
): string {
  const separator = '\n\n---\n\n'
  const marker = `<!-- Amendment: ${action} -->`

  switch (action) {
    case 'add':
      return `${content}${separator}${marker}\n## Added Rule\n\n${text}`
    case 'rephrase':
      return `${content}${separator}${marker}\n## Rephrased Section\n\n> **TODO:** Find and replace the relevant section with:\n\n${text}`
    case 'remove':
      return `${content}${separator}${marker}\n## Removal Note\n\n> **TODO:** Remove the following from the prompt:\n\n${text}`
    default:
      return `${content}${separator}${marker}\n## Suggested Change\n\n${text}`
  }
}
