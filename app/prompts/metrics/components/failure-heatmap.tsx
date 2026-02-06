'use client'

import { useMemo } from 'react'
import type { AnalysisRecord } from '../types'

interface FailureHeatmapProps {
  analyses: AnalysisRecord[]
}

export function FailureHeatmap({ analyses }: FailureHeatmapProps) {
  const { matrix, roles, categories, maxCount } = useMemo(() => {
    // Collect all failure modes by role
    const counts = new Map<string, Map<string, number>>()
    const allRoles = new Set<string>()
    const allCategories = new Set<string>()

    for (const a of analyses) {
      if (a.failure_modes.length === 0) continue
      allRoles.add(a.role)

      if (!counts.has(a.role)) {
        counts.set(a.role, new Map())
      }
      const roleMap = counts.get(a.role)!

      for (const mode of a.failure_modes) {
        allCategories.add(mode)
        roleMap.set(mode, (roleMap.get(mode) ?? 0) + 1)
      }
    }

    const roles = [...allRoles].sort()
    const categories = [...allCategories].sort()

    // Build matrix
    const matrix: number[][] = roles.map((role) => {
      const roleMap = counts.get(role) ?? new Map()
      return categories.map((cat) => roleMap.get(cat) ?? 0)
    })

    // Find max across all cells
    const maxCount = matrix.reduce(
      (max, row) => Math.max(max, ...row),
      0
    )

    return { matrix, roles, categories, maxCount }
  }, [analyses])

  if (roles.length === 0 || categories.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
        Failure Mode Heatmap
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-[var(--text-muted)] pb-2 pr-3 min-w-[80px]">
                Role
              </th>
              {categories.map((cat) => (
                <th
                  key={cat}
                  className="text-center text-xs font-medium text-[var(--text-muted)] pb-2 px-1 min-w-[80px]"
                  title={cat}
                >
                  <span className="block truncate max-w-[100px]">{cat}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((role, ri) => (
              <tr key={role}>
                <td className="text-sm font-medium text-[var(--text-secondary)] py-1 pr-3">
                  {role}
                </td>
                {categories.map((cat, ci) => {
                  const count = matrix[ri][ci]
                  const intensity = maxCount > 0 ? count / maxCount : 0

                  return (
                    <td key={cat} className="py-1 px-1">
                      <div
                        className="rounded h-8 flex items-center justify-center text-xs font-medium transition-colors"
                        style={{
                          backgroundColor: count > 0
                            ? `rgba(239, 68, 68, ${0.15 + intensity * 0.7})`
                            : 'var(--bg-tertiary)',
                          color: intensity > 0.5
                            ? '#fff'
                            : count > 0
                              ? 'var(--accent-red)'
                              : 'var(--text-muted)',
                        }}
                        title={`${role}: ${cat} — ${count} occurrence${count !== 1 ? 's' : ''}`}
                      >
                        {count > 0 ? count : ''}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
