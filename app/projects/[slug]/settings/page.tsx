"use client"

import { use, useState, useEffect } from "react"
import { Settings, MessageSquare, Save, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { Project } from "@/lib/db/types"

type PageProps = {
  params: Promise<{ slug: string }>
}

export default function SettingsPage({ params }: PageProps) {
  const { slug } = use(params)
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [chatLayout, setChatLayout] = useState<'slack' | 'imessage'>('slack')

  // Fetch project data
  useEffect(() => {
    async function fetchProject() {
      try {
        const response = await fetch(`/api/projects/${slug}`)
        if (response.ok) {
          const data = await response.json()
          setProject(data.project)
          setChatLayout(data.project.chat_layout || 'slack')
        }
      } catch (error) {
        console.error('Failed to fetch project:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchProject()
  }, [slug])

  const handleSave = async () => {
    if (!project) return

    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_layout: chatLayout }),
      })

      if (!response.ok) {
        throw new Error('Failed to update project settings')
      }

      const data = await response.json()
      setProject(data.project)
    } catch (error) {
      console.error('Failed to save settings:', error)
      // TODO: Show error toast
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--text-tertiary)]" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Settings className="h-12 w-12 text-[var(--text-tertiary)] mb-4" />
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
          Project Not Found
        </h2>
        <p className="text-[var(--text-secondary)]">
          The project <span className="font-medium">{slug}</span> could not be found.
        </p>
      </div>
    )
  }

  const hasChanges = chatLayout !== project.chat_layout

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          Project Settings
        </h1>
        <p className="text-[var(--text-secondary)]">
          Configure settings for <span className="font-medium">{project.name}</span>
        </p>
      </div>

      <div className="space-y-6">
        {/* Chat Layout Setting */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-[var(--text-primary)]" />
            <Label className="text-base font-medium text-[var(--text-primary)]">
              Chat Layout Style
            </Label>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Choose how messages are displayed in chat conversations.
          </p>
          
          <div className="space-y-4">
            <div className="flex items-start space-x-3 p-4 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-secondary)]/50 transition-colors">
              <input
                type="radio"
                id="slack"
                name="chat-layout"
                value="slack"
                checked={chatLayout === 'slack'}
                onChange={(e) => setChatLayout(e.target.value as 'slack' | 'imessage')}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <div className="space-y-2 flex-1">
                <Label htmlFor="slack" className="text-base font-medium cursor-pointer">
                  Slack Style (Default)
                </Label>
                <p className="text-sm text-[var(--text-secondary)]">
                  All messages are left-aligned with avatars. Traditional chat app appearance.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3 p-4 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-secondary)]/50 transition-colors">
              <input
                type="radio"
                id="imessage"
                name="chat-layout"
                value="imessage"
                checked={chatLayout === 'imessage'}
                onChange={(e) => setChatLayout(e.target.value as 'slack' | 'imessage')}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <div className="space-y-2 flex-1">
                <Label htmlFor="imessage" className="text-base font-medium cursor-pointer">
                  iMessage Style
                </Label>
                <p className="text-sm text-[var(--text-secondary)]">
                  Your messages appear on the right (blue), assistant messages on the left (gray).
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-end pt-6 border-t border-[var(--border)]">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="flex items-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
