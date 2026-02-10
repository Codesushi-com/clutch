"use client"

import { use, useState, useEffect } from "react"
import { Settings, MessageSquare, Save, Loader2, Folder, AlertCircle, CheckCircle2, Clock, Bot, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Project } from "@/lib/types"

// ============================================================================
// Types
// ============================================================================

interface ModelInfo {
  id: string
  alias?: string
  provider: string
  name: string
}

interface ModelsResponse {
  models: ModelInfo[]
  status: "connected" | "disconnected" | "fallback"
  cachedAt?: string
}

// ============================================================================
// Constants
// ============================================================================

const ROLE_DISPLAY_NAMES: Record<string, { name: string; description: string }> = {
  dev: {
    name: "Developer",
    description: "Implements features, fixes bugs, writes code",
  },
  reviewer: {
    name: "Reviewer",
    description: "Reviews pull requests and code changes",
  },
  pm: {
    name: "Product Manager",
    description: "Plans features, manages roadmap",
  },
  research: {
    name: "Researcher",
    description: "Investigates technical questions and solutions",
  },
}

const DEFAULT_ROLE_MODELS: Record<string, string> = {
  dev: "kimi-coding/k2p5",
  reviewer: "kimi-coding/k2p5",
  pm: "gpt",
  research: "gpt",
}

type PageProps = {
  params: Promise<{ slug: string }>
}

export default function SettingsPage({ params }: PageProps) {
  const { slug } = use(params)
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [chatLayout, setChatLayout] = useState<'slack' | 'imessage' | null>(null)
  
  // Codebase configuration state
  const [localPath, setLocalPath] = useState<string>('')
  const [githubRepo, setGithubRepo] = useState<string>('')
  const [pathStatus, setPathStatus] = useState<'unchecked' | 'checking' | 'valid' | 'invalid'>('unchecked')
  const [repoStatus, setRepoStatus] = useState<'unchecked' | 'checking' | 'valid' | 'invalid'>('unchecked')
  const [pathError, setPathError] = useState<string>('')
  const [repoError, setRepoError] = useState<string>('')

  // Work loop configuration state
  const [workLoopEnabled, setWorkLoopEnabled] = useState<boolean>(false)

  // Role model configuration state
  const [roleModelOverrides, setRoleModelOverrides] = useState<Record<string, string>>({})
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [modelsStatus, setModelsStatus] = useState<ModelsResponse["status"]>("disconnected")
  const [modelsLoading, setModelsLoading] = useState(true)

  // Fetch project data
  useEffect(() => {
    async function fetchProject() {
      try {
        const response = await fetch(`/api/projects/${slug}`)
        if (response.ok) {
          const data = await response.json()
          setProject(data.project)
          setChatLayout(data.project.chat_layout)
          setLocalPath(data.project.local_path || '')
          setGithubRepo(data.project.github_repo || '')
          setWorkLoopEnabled(Boolean(data.project.work_loop_enabled))
          setRoleModelOverrides(data.project.role_model_overrides || {})
        }
      } catch (error) {
        console.error('Failed to fetch project:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchProject()
  }, [slug])

  // Fetch available models
  useEffect(() => {
    async function fetchModels() {
      try {
        const response = await fetch('/api/openclaw/models')
        if (response.ok) {
          const data: ModelsResponse = await response.json()
          setAvailableModels(data.models)
          setModelsStatus(data.status)
        }
      } catch (error) {
        console.error('Failed to fetch models:', error)
        setModelsStatus('disconnected')
      } finally {
        setModelsLoading(false)
      }
    }
    fetchModels()
  }, [])

  // Validate local path
  const validatePath = async (path: string) => {
    if (!path.trim()) {
      setPathStatus('unchecked')
      setPathError('')
      return
    }
    
    setPathStatus('checking')
    setPathError('')
    
    try {
      const response = await fetch('/api/validate/path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path.trim() }),
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.exists) {
          setPathStatus('valid')
        } else {
          setPathStatus('invalid')
          setPathError('Path does not exist')
        }
      } else {
        setPathStatus('invalid')
        setPathError('Unable to validate path')
      }
    } catch {
      setPathStatus('invalid')
      setPathError('Network error while validating path')
    }
  }

  // Validate GitHub repo
  const validateRepo = async (repo: string) => {
    if (!repo.trim()) {
      setRepoStatus('unchecked')
      setRepoError('')
      return
    }
    
    // Check format first
    if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo.trim())) {
      setRepoStatus('invalid')
      setRepoError('Must be in owner/repo format')
      return
    }
    
    setRepoStatus('checking')
    setRepoError('')
    
    try {
      const response = await fetch('/api/validate/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repo.trim() }),
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.accessible) {
          setRepoStatus('valid')
        } else {
          setRepoStatus('invalid')
          setRepoError(data.error || 'Repository not accessible')
        }
      } else {
        setRepoStatus('invalid')
        setRepoError('Unable to validate repository')
      }
    } catch {
      setRepoStatus('invalid')
      setRepoError('Network error while validating repository')
    }
  }

  // Handle input changes with validation
  const handlePathChange = (value: string) => {
    setLocalPath(value)
    setPathStatus('unchecked')
    setPathError('')
  }

  const handleRepoChange = (value: string) => {
    setGithubRepo(value)
    setRepoStatus('unchecked') 
    setRepoError('')
  }

  const handleSave = async () => {
    if (!project) return

    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_layout: chatLayout,
          local_path: localPath.trim() || null,
          github_repo: githubRepo.trim() || null,
          work_loop_enabled: workLoopEnabled,
          role_model_overrides: Object.keys(roleModelOverrides).length > 0 ? roleModelOverrides : null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update project settings')
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

  // Handle role model change
  const handleRoleModelChange = (role: string, modelId: string | null) => {
    setRoleModelOverrides(prev => {
      const updated = { ...prev }
      if (modelId === null || modelId === DEFAULT_ROLE_MODELS[role]) {
        delete updated[role]
      } else {
        updated[role] = modelId
      }
      return updated
    })
  }

  // Get display name for a model
  const getModelDisplayName = (modelId: string): string => {
    const model = availableModels.find(m => m.id === modelId)
    if (model?.alias) {
      return `${model.alias} (${model.id})`
    }
    return modelId
  }

  // Group models by provider
  const groupedModels = availableModels.reduce((acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = []
    }
    acc[model.provider].push(model)
    return acc
  }, {} as Record<string, ModelInfo[]>) 

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

  // Check if role model overrides have changed
  const originalOverrides = project.role_model_overrides || {}
  const currentOverrides = roleModelOverrides
  const hasRoleModelChanges = JSON.stringify(originalOverrides) !== JSON.stringify(currentOverrides)

  const hasChanges = (chatLayout !== null && chatLayout !== project.chat_layout) ||
    localPath !== (project.local_path || '') ||
    githubRepo !== (project.github_repo || '') ||
    workLoopEnabled !== Boolean(project.work_loop_enabled) ||
    hasRoleModelChanges

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
        {/* Codebase Configuration */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Folder className="h-5 w-5 text-[var(--text-primary)]" />
            <Label className="text-base font-medium text-[var(--text-primary)]">
              Codebase Configuration
            </Label>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Configure the local development environment and GitHub repository for this project.
          </p>
          
          <div className="space-y-4">
            {/* Local Path Field */}
            <div className="space-y-2">
              <Label htmlFor="local-path" className="text-sm font-medium">
                Local Path
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="local-path"
                  type="text"
                  placeholder="/path/to/project"
                  value={localPath}
                  onChange={(e) => handlePathChange(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => validatePath(localPath)}
                  disabled={!localPath.trim() || pathStatus === 'checking'}
                  className="shrink-0"
                >
                  {pathStatus === 'checking' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      Checking...
                    </>
                  ) : (
                    'Validate'
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2 min-h-[1.5rem]">
                {pathStatus === 'valid' && (
                  <div className="flex items-center gap-1 text-green-600 text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    Path exists
                  </div>
                )}
                {pathStatus === 'invalid' && (
                  <div className="flex items-center gap-1 text-red-600 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    {pathError}
                  </div>
                )}
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                The local file system path where your project&apos;s source code is located. This allows agents to read and modify project files.
              </p>
            </div>

            {/* GitHub Repo Field */}
            <div className="space-y-2">
              <Label htmlFor="github-repo" className="text-sm font-medium">
                GitHub Repository
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="github-repo"
                  type="text"
                  placeholder="owner/repository"
                  value={githubRepo}
                  onChange={(e) => handleRepoChange(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => validateRepo(githubRepo)}
                  disabled={!githubRepo.trim() || repoStatus === 'checking'}
                  className="shrink-0"
                >
                  {repoStatus === 'checking' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      Checking...
                    </>
                  ) : (
                    'Validate'
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2 min-h-[1.5rem]">
                {repoStatus === 'valid' && (
                  <div className="flex items-center gap-1 text-green-600 text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    Repository accessible
                  </div>
                )}
                {repoStatus === 'invalid' && (
                  <div className="flex items-center gap-1 text-red-600 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    {repoError}
                  </div>
                )}
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                The GitHub repository in owner/repository format. This enables agents to create pull requests, issues, and access repository information.
              </p>
            </div>
          </div>
        </div>

        {/* Work Loop Configuration */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-[var(--text-primary)]" />
            <Label className="text-base font-medium text-[var(--text-primary)]">
              Automated Work Loop
            </Label>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Configure automated task processing that pulls from your Kanban board and creates pull requests.
          </p>
          
          <div className="space-y-4">
            {/* Enable Work Loop */}
            <div className="flex items-start space-x-3 p-4 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-secondary)]/50 transition-colors">
              <input
                type="checkbox"
                id="work-loop-enabled"
                checked={workLoopEnabled}
                onChange={(e) => setWorkLoopEnabled(e.target.checked)}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <div className="space-y-2 flex-1">
                <Label htmlFor="work-loop-enabled" className="text-base font-medium cursor-pointer">
                  Enable Work Loop
                </Label>
                <p className="text-sm text-[var(--text-secondary)]">
                  Automatically process tasks from the &apos;ready&apos; status, create pull requests, and move them through the workflow.
                </p>
              </div>
            </div>

            {/* Prerequisites warning */}
            {workLoopEnabled && (!localPath.trim() || !githubRepo.trim()) && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 border border-orange-200">
                <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-orange-800">
                    Configuration Required
                  </p>
                  <p className="text-sm text-orange-700 mt-1">
                    Work loop requires both local path and GitHub repository to be configured.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

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

        {/* Role Models Configuration */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-[var(--text-primary)]" />
            <Label className="text-base font-medium text-[var(--text-primary)]">
              Agent Role Models
            </Label>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Configure which AI model each agent role uses for this project.
          </p>

          {/* Gateway status warning */}
          {modelsStatus === 'disconnected' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <WifiOff className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  Gateway Disconnected
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  Model list may be outdated. Changes will still be saved, but model availability cannot be verified.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {Object.entries(ROLE_DISPLAY_NAMES).map(([role, { name, description }]) => {
              const currentModel = roleModelOverrides[role] || DEFAULT_ROLE_MODELS[role]
              const isOverridden = roleModelOverrides[role] !== undefined

              return (
                <div key={role} className="p-4 rounded-lg border border-[var(--border)] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium text-[var(--text-primary)]">
                        {name}
                      </Label>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {description}
                      </p>
                    </div>
                    {isOverridden && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRoleModelChange(role, null)}
                        className="text-xs h-7"
                      >
                        Reset to default
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <Select
                      value={currentModel}
                      onValueChange={(value) => handleRoleModelChange(role, value)}
                      disabled={modelsLoading}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select a model">
                          {getModelDisplayName(currentModel)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(groupedModels).map(([provider, models]) => (
                          <SelectGroup key={provider}>
                            <SelectLabel className="capitalize">{provider}</SelectLabel>
                            {models.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.alias ? `${model.alias} (${model.id})` : model.id}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[var(--text-secondary)]">Default:</span>
                    <code className="bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded text-[var(--text-primary)]">
                      {DEFAULT_ROLE_MODELS[role]}
                    </code>
                    {isOverridden && (
                      <span className="text-blue-600 font-medium">(overridden)</span>
                    )}
                  </div>
                </div>
              )
            })}
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
