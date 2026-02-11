'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Check, ChevronDown, ChevronRight, Copy, FlaskConical, GitCompare, Star, User, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { PromptVersion } from '../types'
import { DiffView } from './diff-view'

interface VersionListProps {
  versions: PromptVersion[]
  selectedRole: string
  selectedModel: string
  onSetActive: (version: PromptVersion) => void
  onDuplicate: (version: PromptVersion) => void
  onStartABTest: (version: PromptVersion) => void
  hasActiveABTest: boolean
  onSeedPrompts?: () => Promise<void>
}

export function VersionList({
  versions,
  selectedRole,
  selectedModel,
  onSetActive,
  onDuplicate,
  onStartABTest,
  hasActiveABTest,
  onSeedPrompts,
}: VersionListProps) {
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null)
  const [diffMode, setDiffMode] = useState<'none' | 'selecting' | 'viewing'>('none')
  const [diffBase, setDiffBase] = useState<PromptVersion | null>(null)
  const [diffTarget, setDiffTarget] = useState<PromptVersion | null>(null)

  // Filter versions by role and model
  const filteredVersions = versions.filter(v =>
    v.role === selectedRole && v.model === (selectedModel === 'default' ? undefined : selectedModel)
  ).sort((a, b) => b.version - a.version) // Newest first

  const [isSeeding, setIsSeeding] = useState(false)

  const handleSeedPrompts = async () => {
    if (!onSeedPrompts) {
      // Fallback: call API directly
      setIsSeeding(true)
      try {
        const res = await fetch('/api/prompts/seed', { method: 'POST' })
        if (!res.ok) throw new Error('Failed to seed prompts')
        const data = await res.json()
        toast.success(`Seeded ${data.summary.created} prompts`)
        // Refresh the page to show new versions
        window.location.reload()
      } catch (error) {
        console.error('Error seeding prompts:', error)
        toast.error('Failed to seed prompts')
      } finally {
        setIsSeeding(false)
      }
      return
    }

    setIsSeeding(true)
    try {
      await onSeedPrompts()
      toast.success('Prompts seeded successfully')
    } catch (error) {
      console.error('Error seeding prompts:', error)
      toast.error('Failed to seed prompts')
    } finally {
      setIsSeeding(false)
    }
  }

  const handleStartDiff = (version: PromptVersion) => {
    if (diffMode === 'none') {
      setDiffMode('selecting')
      setDiffBase(version)
    } else if (diffMode === 'selecting') {
      if (diffBase?.id === version.id) {
        // Cancel diff selection
        setDiffMode('none')
        setDiffBase(null)
      } else {
        setDiffTarget(version)
        setDiffMode('viewing')
      }
    }
  }

  const handleCancelDiff = () => {
    setDiffMode('none')
    setDiffBase(null)
    setDiffTarget(null)
  }

  const handleSwapDiff = () => {
    if (diffBase && diffTarget) {
      setDiffBase(diffTarget)
      setDiffTarget(diffBase)
    }
  }

  if (filteredVersions.length === 0) {
    // Check if any versions exist for any role (global empty state)
    const hasAnyVersions = versions.length > 0

    return (
      <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)]">
        <p className="text-sm">No versions found for this role</p>
        {!hasAnyVersions && (
          <>
            <p className="text-xs mt-1 mb-4">Initialize default prompts to get started</p>
            <button
              onClick={handleSeedPrompts}
              disabled={isSeeding}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-[var(--accent-foreground)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSeeding ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Initializing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Initialize default prompts
                </>
              )}
            </button>
          </>
        )}
        {hasAnyVersions && (
          <p className="text-xs mt-1">Create a new version to get started</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Diff mode indicator */}
      {diffMode !== 'none' && (
        <div className="flex items-center justify-between px-4 py-2 bg-[var(--accent)]/10 rounded-lg border border-[var(--accent)]/20">
          <div className="flex items-center gap-2 text-sm">
            <GitCompare className="h-4 w-4 text-[var(--accent-blue)]" />
            {diffMode === 'selecting' ? (
              <span>Select another version to compare with v{diffBase?.version}</span>
            ) : (
              <span>Comparing v{diffBase?.version} → v{diffTarget?.version}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {diffMode === 'viewing' && (
              <Button size="sm" variant="ghost" onClick={handleSwapDiff}>
                Swap
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={handleCancelDiff}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Diff view */}
      {diffMode === 'viewing' && diffBase && diffTarget && (
        <Card className="p-4">
          <DiffView
            oldContent={diffBase.content}
            newContent={diffTarget.content}
            oldLabel={`v${diffBase.version}`}
            newLabel={`v${diffTarget.version}`}
          />
        </Card>
      )}

      {/* Version list */}
      <div className="space-y-2">
        {filteredVersions.map(version => {
          const isExpanded = expandedVersion === version.id
          const isActive = version.active
          const isDiffBase = diffBase?.id === version.id
          const isDiffTarget = diffTarget?.id === version.id
          const isControl = version.ab_status === 'control'
          const isChallenger = version.ab_status === 'challenger'
          const isInABTest = isControl || isChallenger
          // Can start A/B test if: not active, no current A/B test, and there's an active version to be control
          const canStartAB = !isActive && !hasActiveABTest && !isInABTest

          return (
            <Card
              key={version.id}
              className={cn(
                "overflow-hidden transition-colors",
                isActive && !isInABTest && "border-[var(--accent-green)]",
                isControl && "border-[var(--accent-blue)]",
                isChallenger && "border-[var(--accent-purple)]",
                isDiffBase && !isInABTest && "border-[var(--accent-blue)]",
                isDiffTarget && !isInABTest && "border-[var(--accent-purple)]"
              )}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => setExpandedVersion(isExpanded ? null : version.id)}
                  className="p-1 rounded hover:bg-[var(--bg-tertiary)]"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                  )}
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-lg font-mono font-semibold text-[var(--text-primary)]">
                    v{version.version}
                  </span>
                  {isActive && !isInABTest && (
                    <Badge className="bg-[var(--accent-green)]/20 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/30">
                      <Star className="h-3 w-3 mr-1 fill-current" />
                      Active
                    </Badge>
                  )}
                  {isControl && (
                    <Badge className="bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/30">
                      <FlaskConical className="h-3 w-3 mr-1" />
                      Control
                    </Badge>
                  )}
                  {isChallenger && (
                    <Badge className="bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/30">
                      <FlaskConical className="h-3 w-3 mr-1" />
                      Challenger
                    </Badge>
                  )}
                </div>

                <div className="flex-1" />

                <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {version.created_by}
                  </span>
                  <span>{format(version.created_at, 'MMM d, yyyy')}</span>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleStartDiff(version)}
                    disabled={diffMode === 'viewing'}
                    className={cn(
                      isDiffBase && "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]",
                      isDiffTarget && "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]"
                    )}
                  >
                    <GitCompare className="h-4 w-4" />
                  </Button>

                  {canStartAB && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onStartABTest(version)}
                      title="Start A/B test with this version as challenger"
                      className="text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/10"
                    >
                      <FlaskConical className="h-4 w-4" />
                    </Button>
                  )}

                  {!isActive && !isInABTest && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onSetActive(version)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDuplicate(version)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-[var(--border)]">
                  {version.change_summary && (
                    <div className="py-2 text-sm text-[var(--text-secondary)]">
                      <span className="font-medium">Change Summary:</span> {version.change_summary}
                    </div>
                  )}
                  <pre className="mt-2 p-4 bg-[var(--bg-primary)] rounded text-xs text-[var(--text-secondary)] overflow-auto max-h-96 whitespace-pre-wrap">
                    {version.content}
                  </pre>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
