'use client'

import { useState } from 'react'
import { FileText, GitBranch, Plus, Star, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { PromptVersion } from '../types'

const ROLES = [
  { id: 'dev', label: 'Developer', description: 'Implements features and fixes bugs' },
  { id: 'pm', label: 'Project Manager', description: 'Breaks down epics into tasks' },
  { id: 'qa', label: 'QA Engineer', description: 'Tests and verifies implementations' },
  { id: 'researcher', label: 'Researcher', description: 'Investigates and documents findings' },
  { id: 'reviewer', label: 'Code Reviewer', description: 'Reviews PRs and ensures quality' },
  { id: 'pe', label: 'Prompt Engineer', description: 'Optimizes and refines prompts' },
  { id: 'analyzer', label: 'Analyzer', description: 'Analyzes task outcomes' },
] as const

const MODELS = [
  { id: 'default', label: 'Default' },
  { id: 'kimi', label: 'Kimi' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'opus', label: 'Opus' },
]

interface RoleSidebarProps {
  selectedRole: string | null
  selectedModel: string
  onSelectRole: (role: string) => void
  onSelectModel: (model: string) => void
  versions: PromptVersion[]
  onNewVersion: () => void
}

export function RoleSidebar({
  selectedRole,
  selectedModel,
  onSelectRole,
  onSelectModel,
  versions,
  onNewVersion,
}: RoleSidebarProps) {
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set())

  const toggleExpanded = (roleId: string) => {
    const newExpanded = new Set(expandedRoles)
    if (newExpanded.has(roleId)) {
      newExpanded.delete(roleId)
    } else {
      newExpanded.add(roleId)
    }
    setExpandedRoles(newExpanded)
  }

  const getActiveVersionForRole = (roleId: string, model: string) => {
    return versions.find(v => v.role === roleId && v.model === (model === 'default' ? undefined : model) && v.active)
  }

  const getVersionCountForRole = (roleId: string, model: string) => {
    return versions.filter(v => v.role === roleId && v.model === (model === 'default' ? undefined : model)).length
  }

  return (
    <div className="w-full lg:w-72 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Role Templates</h2>
          <Button size="sm" variant="ghost" onClick={onNewVersion}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Model Selector */}
        <select
          value={selectedModel}
          onChange={(e) => onSelectModel(e.target.value)}
          className="w-full px-3 py-1.5 text-xs bg-[var(--bg-tertiary)] border border-[var(--border)] rounded text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
        >
          {MODELS.map(model => (
            <option key={model.id} value={model.id}>{model.label}</option>
          ))}
        </select>
      </div>

      {/* Role List */}
      <div className="flex-1 overflow-y-auto">
        {ROLES.map(role => {
          const isSelected = selectedRole === role.id
          const isExpanded = expandedRoles.has(role.id)
          const activeVersion = getActiveVersionForRole(role.id, selectedModel)
          const versionCount = getVersionCountForRole(role.id, selectedModel)
          const hasVariants = MODELS.some(m => m.id !== 'default' && getVersionCountForRole(role.id, m.id) > 0)

          return (
            <div key={role.id}>
              <button
                onClick={() => onSelectRole(role.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-4 py-3 text-left transition-colors",
                  isSelected
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                )}
              >
                {hasVariants && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleExpanded(role.id)
                    }}
                    className="p-0.5 rounded hover:bg-[var(--bg-tertiary)]"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                )}
                {!hasVariants && <div className="w-4" />}

                <FileText className="h-4 w-4 flex-shrink-0" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{role.label}</span>
                    {activeVersion && (
                      <Star className="h-3 w-3 fill-[var(--accent-yellow)] text-[var(--accent-yellow)]" />
                    )}
                  </div>
                  <p className={cn(
                    "text-xs truncate",
                    isSelected ? "text-[var(--accent-foreground)]/70" : "text-[var(--text-muted)]"
                  )}>
                    {versionCount} version{versionCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </button>

              {/* Model variants */}
              {isExpanded && hasVariants && (
                <div className="bg-[var(--bg-primary)]">
                  {MODELS.filter(m => m.id !== 'default').map(model => {
                    const modelCount = getVersionCountForRole(role.id, model.id)
                    if (modelCount === 0) return null
                    const modelActive = getActiveVersionForRole(role.id, model.id)

                    return (
                      <button
                        key={model.id}
                        onClick={() => {
                          onSelectModel(model.id)
                          onSelectRole(role.id)
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 pl-10 pr-4 py-2 text-left text-xs transition-colors",
                          selectedRole === role.id && selectedModel === model.id
                            ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                            : "hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                        )}
                      >
                        <GitBranch className="h-3 w-3" />
                        <span>{model.label}</span>
                        {modelActive && (
                          <Badge variant="outline" className="ml-auto text-[10px] px-1 py-0">
                            Active
                          </Badge>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
