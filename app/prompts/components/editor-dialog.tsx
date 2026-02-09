'use client'

import { useState, useEffect } from 'react'
import { FileText, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { PromptVersion } from '../types'

const ROLES = [
  { id: 'dev', label: 'Developer' },
  { id: 'pm', label: 'Project Manager' },
  { id: 'qa', label: 'QA Engineer' },
  { id: 'researcher', label: 'Researcher' },
  { id: 'reviewer', label: 'Code Reviewer' },
  { id: 'pe', label: 'Prompt Engineer' },
  { id: 'analyzer', label: 'Analyzer' },
] as const

const MODELS = [
  { id: 'default', label: 'Default' },
  { id: 'kimi', label: 'Kimi' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'opus', label: 'Opus' },
]

interface EditorDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: {
    role: string
    content: string
    model?: string
    change_summary?: string
    parent_version_id?: string
  }) => void
  initialRole?: string
  initialModel?: string
  initialContent?: string
  parentVersion?: PromptVersion | null
  mode: 'create' | 'duplicate'
}

export function EditorDialog({
  isOpen,
  onClose,
  onSave,
  initialRole = 'dev',
  initialModel = 'default',
  initialContent = '',
  parentVersion,
  mode,
}: EditorDialogProps) {
  const [role, setRole] = useState(initialRole)
  const [model, setModel] = useState(initialModel)
  const [content, setContent] = useState(initialContent)
  const [changeSummary, setChangeSummary] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setRole(initialRole)
      setModel(initialModel)
      setContent(initialContent)
      setChangeSummary('')
    }
  }, [isOpen, initialRole, initialModel, initialContent])

  const handleSave = async () => {
    if (!content.trim()) return

    setIsSubmitting(true)
    try {
      await onSave({
        role,
        content,
        model: model === 'default' ? undefined : model,
        change_summary: changeSummary || undefined,
        parent_version_id: parentVersion?.id,
      })
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const roleLabel = ROLES.find(r => r.id === role)?.label || role

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {mode === 'duplicate' ? `Duplicate ${roleLabel} Template` : 'New Version'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Role and Model selectors */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)] mb-1.5 block">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
              >
                {ROLES.map(r => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)] mb-1.5 block">
                Model Variant
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
              >
                {MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Change summary */}
          <div>
            <label className="text-sm font-medium text-[var(--text-secondary)] mb-1.5 block">
              Change Summary (optional)
            </label>
            <Input
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              placeholder="Brief description of what changed..."
              className="bg-[var(--bg-tertiary)] border-[var(--border)]"
            />
          </div>

          {/* Content editor */}
          <div>
            <label className="text-sm font-medium text-[var(--text-secondary)] mb-1.5 block">
              Template Content
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# Role: Developer

## Responsibilities
- Implement features according to specifications
- Write clean, well-tested code
..."
              className="min-h-[400px] font-mono text-sm bg-[var(--bg-tertiary)] border-[var(--border)] resize-none"
            />
          </div>

          {parentVersion && (
            <div className="text-xs text-[var(--text-muted)]">
              Parent: v{parentVersion.version} ({parentVersion.role}{parentVersion.model ? `/${parentVersion.model}` : ''})
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border)]">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!content.trim() || isSubmitting}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSubmitting ? 'Saving...' : 'Save Version'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
