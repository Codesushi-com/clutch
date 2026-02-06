'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { RoleSidebar } from './components/role-sidebar'
import { VersionList } from './components/version-list'
import { EditorDialog } from './components/editor-dialog'
import type { PromptVersion } from './types'

const ROLES = [
  { id: 'dev', label: 'Developer' },
  { id: 'pm', label: 'Project Manager' },
  { id: 'qa', label: 'QA Engineer' },
  { id: 'researcher', label: 'Researcher' },
  { id: 'reviewer', label: 'Code Reviewer' },
  { id: 'pe', label: 'Prompt Engineer' },
  { id: 'analyzer', label: 'Analyzer' },
] as const

export default function PromptsPage() {
  const [selectedRole, setSelectedRole] = useState<string>('dev')
  const [selectedModel, setSelectedModel] = useState<string>('default')
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'duplicate'>('create')
  const [duplicateSource, setDuplicateSource] = useState<PromptVersion | null>(null)

  // Fetch all versions on mount
  const fetchVersions = useCallback(async () => {
    try {
      // Fetch versions for all roles to populate sidebar counts
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

  useEffect(() => {
    fetchVersions()
  }, [fetchVersions])

  const handleSetActive = async (version: PromptVersion) => {
    try {
      const res = await fetch(`/api/prompts/${version.id}/activate`, {
        method: 'PATCH',
      })

      if (!res.ok) {
        throw new Error('Failed to activate version')
      }

      // Update local state
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
      {/* Sidebar */}
      <RoleSidebar
        selectedRole={selectedRole}
        selectedModel={selectedModel}
        onSelectRole={setSelectedRole}
        onSelectModel={setSelectedModel}
        versions={versions}
        onNewVersion={handleNewVersion}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-[var(--text-muted)]" />
            <div>
              <h1 className="text-lg font-semibold text-[var(--text-primary)]">
                {roleLabel}{modelLabel}
              </h1>
              <p className="text-sm text-[var(--text-muted)]">
                Version history and prompt templates
              </p>
            </div>
          </div>
        </div>

        {/* Version list */}
        <div className="flex-1 overflow-y-auto p-6">
          <VersionList
            versions={versions}
            selectedRole={selectedRole}
            selectedModel={selectedModel}
            onSetActive={handleSetActive}
            onDuplicate={handleDuplicate}
          />
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
    </div>
  )
}
