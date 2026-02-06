'use client'

import { useMemo } from 'react'
import { diffLines } from 'diff'

interface DiffViewProps {
  oldContent: string
  newContent: string
  oldLabel?: string
  newLabel?: string
}

export function DiffView({ oldContent, newContent, oldLabel, newLabel }: DiffViewProps) {
  const changes = useMemo(() => {
    return diffLines(oldContent, newContent, { newlineIsToken: true })
  }, [oldContent, newContent])

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="flex border-b border-[var(--border)]">
        <div className="flex-1 px-4 py-2 bg-red-500/10 border-r border-[var(--border)]">
          <span className="text-xs font-medium text-red-400">{oldLabel || 'Old Version'}</span>
        </div>
        <div className="flex-1 px-4 py-2 bg-green-500/10">
          <span className="text-xs font-medium text-green-400">{newLabel || 'New Version'}</span>
        </div>
      </div>

      {/* Diff content */}
      <div className="max-h-[500px] overflow-auto font-mono text-xs">
        {changes.map((change, index) => {
          if (change.added) {
            return (
              <div key={index} className="flex bg-green-500/10">
                <div className="w-10 px-2 py-1 text-right text-[var(--text-muted)] border-r border-[var(--border)] select-none">
                  +
                </div>
                <pre className="flex-1 px-4 py-1 text-green-400 whitespace-pre-wrap break-all">
                  {change.value}
                </pre>
              </div>
            )
          }
          if (change.removed) {
            return (
              <div key={index} className="flex bg-red-500/10">
                <div className="w-10 px-2 py-1 text-right text-[var(--text-muted)] border-r border-[var(--border)] select-none">
                  -
                </div>
                <pre className="flex-1 px-4 py-1 text-red-400 whitespace-pre-wrap break-all">
                  {change.value}
                </pre>
              </div>
            )
          }
          return (
            <div key={index} className="flex">
              <div className="w-10 px-2 py-1 text-right text-[var(--text-muted)] border-r border-[var(--border)] select-none">
                ·
              </div>
              <pre className="flex-1 px-4 py-1 text-[var(--text-secondary)] whitespace-pre-wrap break-all">
                {change.value}
              </pre>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface UnifiedDiffViewProps {
  oldContent: string
  newContent: string
}

export function UnifiedDiffView({ oldContent, newContent }: UnifiedDiffViewProps) {
  const changes = useMemo(() => {
    return diffLines(oldContent, newContent, { newlineIsToken: true })
  }, [oldContent, newContent])

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg-primary)] font-mono text-xs">
      <div className="max-h-[500px] overflow-auto">
        {changes.map((change, index) => {
          if (change.added) {
            return (
              <pre key={index} className="px-4 py-1 bg-green-500/10 text-green-400 whitespace-pre-wrap break-all border-l-2 border-green-500">
                + {change.value}
              </pre>
            )
          }
          if (change.removed) {
            return (
              <pre key={index} className="px-4 py-1 bg-red-500/10 text-red-400 whitespace-pre-wrap break-all border-l-2 border-red-500">
                - {change.value}
              </pre>
            )
          }
          return (
            <pre key={index} className="px-4 py-1 text-[var(--text-secondary)] whitespace-pre-wrap break-all">
              {'  '}{change.value}
            </pre>
          )
        })}
      </div>
    </div>
  )
}
