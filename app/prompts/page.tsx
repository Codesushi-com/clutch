'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, Loader2, ListChecks } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { RoleSidebar } from './components/role-sidebar'
import { VersionList } from './components/version-list'
import { EditorDialog } from './components/editor-dialog'
import { AmendmentQueue } from './components/amendment-queue'
import { ABResultsPanel } from './components/ab-results-panel'
import { ABStartDialog } from './components/ab-start-dialog'
import type { ABTestState, PromptVersion } from './types'

const ROLES = [
  { id: 'dev', label: 'Developer' },
  { id: 'pm', label: 'Project Manager' },
  { id: 'qa', label: 'QA Engineer' },
  { id: 'researcher', label: 'Researcher' },
  { id: 'reviewer', label: 'Code Reviewer' },
  { id: 'pe', label: 'Prompt Engineer' },
  { id: 'analyzer', label: 'Analyzer' },
] as const

type Tab = 'versions' | 'amendments'

export default function PromptsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('versions')
  const [selectedRole, setSelectedRole] = useState<string>('dev')
  const [selectedModel, setSelectedModel] = useState<string>('default')
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'duplicate'>('create')
  const [duplicateSource, setDuplicateSource] = useState<PromptVersion | null>(null)
  const [amendmentCount, setAmendmentCount] = useState(0)

  // A/B test state
  const [abTestState, setABTestState] = useState<ABTestState | null>(null)
  const [abStartChallenger, setABStartChallenger] = useState<PromptVersion | null>(null)
  const [isABStartOpen, setIsABStartOpen] = useState(false)

  const fetchVersions = useCallback(async () => {
    try {
      const allVersions: PromptVersion[] = []
      for (const role of ROLES) {
        const res = await fetch(`/api/prompts?role=${role.id}`)
        if (res.ok) {
          const data = await res.json()
          allVersions.push(...data.versions)
        }
      }
      setVersions(allVersions)
    } catch (error) {
      console.error('Error fetching versions:', error)
      toast.error('Failed to load prompt versions')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch amendment count for the badge
  const fetchAmendmentCount = useCallback(async () => {
    try {
      const res = await fetch('/api/prompts/amendments')
      if (res.ok) {
        const data = await res.json()
        setAmendmentCount(data.analyses?.length ?? 0)
      }
    } catch {
      // Non-critical, silently ignore
    }
  }, [])

  // Fetch A/B test state for current role+model
  const fetchABTestState = useCallback(async () => {
    const modelParam = selectedModel === 'default' ? '' : `&model=${selectedModel}`
    const res = await fetch(`/api/prompts/ab-test?role=${selectedRole}${modelParam}`)
    if (res.ok) {
      const data = await res.json()
      setABTestState(data)
    }
  }, [selectedRole, selectedModel])

  useEffect(() => {
    fetchVersions()
    fetchAmendmentCount()
  }, [fetchVersions, fetchAmendmentCount])

  useEffect(() => {
    fetchABTestState()
  }, [fetchABTestState])

  // Poll A/B test state while test is active (every 15s)
  useEffect(() => {
    if (!abTestState?.active) return
    const interval = setInterval(fetchABTestState, 15000)
    return () => clearInterval(interval)
  }, [abTestState?.active, fetchABTestState])

  const handleSetActive = async (version: PromptVersion) => {
    try {
      const res = await fetch(`/api/prompts/${version.id}/activate`, {
        method: 'PATCH',
      })

      if (!res.ok) {
        throw new Error('Failed to activate version')
      }

      setVersions(prev => prev.map(v => ({
        ...v,
        active: v.role === version.role && v.model === version.model
          ? v.id === version.id
          : v.active
      })))

      toast.success(`Version v${version.version} is now active`)
    } catch (error) {
      console.error('Error activating version:', error)
      toast.error('Failed to activate version')
    }
  }

  const handleCreateVersion = async (data: {
    role: string
    content: string
    model?: string
    change_summary?: string
    parent_version_id?: string
  }) => {
    const res = await fetch('/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      throw new Error('Failed to create version')
    }

    const { version } = await res.json()
    setVersions(prev => [...prev, version])
    toast.success(`Created v${version.version} for ${data.role}`)
  }

  const handleDuplicate = (version: PromptVersion) => {
    setDuplicateSource(version)
    setEditorMode('duplicate')
    setIsEditorOpen(true)
  }

  const handleNewVersion = () => {
    setDuplicateSource(null)
    setEditorMode('create')
    setIsEditorOpen(true)
  }

  const handleVersionCreated = () => {
    fetchVersions()
    fetchAmendmentCount()
  }

  const handleStartABTest = (version: PromptVersion) => {
    setABStartChallenger(version)
    setIsABStartOpen(true)
  }

  const handleABTestStarted = () => {
    fetchABTestState()
    fetchVersions()
  }

  const handleABTestEnded = () => {
    setABTestState(null)
    fetchABTestState()
    fetchVersions()
  }

  const roleLabel = ROLES.find(r => r.id === selectedRole)?.label || selectedRole
  const modelLabel = selectedModel === 'default' ? '' : ` (${selectedModel})`

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {/* Sidebar — only shown on versions tab */}
      {activeTab === 'versions' && (
        <RoleSidebar
          selectedRole={selectedRole}
          selectedModel={selectedModel}
          onSelectRole={setSelectedRole}
          onSelectModel={setSelectedModel}
          versions={versions}
          onNewVersion={handleNewVersion}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with tabs */}
        <div className="border-b border-[var(--border)]">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-[var(--text-muted)]" />
              <div>
                <h1 className="text-lg font-semibold text-[var(--text-primary)]">
                  {activeTab === 'versions'
                    ? `${roleLabel}${modelLabel}`
                    : 'Amendment Queue'}
                </h1>
                <p className="text-sm text-[var(--text-muted)]">
                  {activeTab === 'versions'
                    ? 'Version history and prompt templates'
                    : 'Review AI-suggested prompt changes'}
                </p>
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex px-6 gap-1">
            <button
              onClick={() => setActiveTab('versions')}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'versions'
                  ? 'border-[var(--accent-blue)] text-[var(--accent-blue)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Versions
              </span>
            </button>
            <button
              onClick={() => setActiveTab('amendments')}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'amendments'
                  ? 'border-[var(--accent-blue)] text-[var(--accent-blue)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
            >
              <span className="flex items-center gap-2">
                <ListChecks className="h-4 w-4" />
                Amendments
                {amendmentCount > 0 && (
                  <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-xs font-medium bg-[var(--accent-blue)] text-white">
                    {amendmentCount}
                  </span>
                )}
              </span>
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'versions' && (
            <>
              {/* A/B Test Results Panel */}
              {abTestState?.active && (
                <ABResultsPanel
                  state={abTestState}
                  onEnd={handleABTestEnded}
                />
              )}

              <VersionList
                versions={versions}
                selectedRole={selectedRole}
                selectedModel={selectedModel}
                onSetActive={handleSetActive}
                onDuplicate={handleDuplicate}
                onStartABTest={handleStartABTest}
                hasActiveABTest={abTestState?.active ?? false}
              />
            </>
          )}
          {activeTab === 'amendments' && (
            <AmendmentQueue
              versions={versions}
              onVersionCreated={handleVersionCreated}
            />
          )}
        </div>
      </div>

      {/* Editor dialog */}
      <EditorDialog
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSave={handleCreateVersion}
        initialRole={selectedRole}
        initialModel={selectedModel}
        initialContent={duplicateSource?.content || ''}
        parentVersion={duplicateSource}
        mode={editorMode}
      />

      {/* A/B Test Start dialog */}
      <ABStartDialog
        isOpen={isABStartOpen}
        onClose={() => setIsABStartOpen(false)}
        onStarted={handleABTestStarted}
        challenger={abStartChallenger}
      />
    </div>
  )
}
