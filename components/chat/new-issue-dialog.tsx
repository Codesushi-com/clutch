"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { X, Send, ImageIcon, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TaskPriority } from "@/lib/types"

interface NewIssueDialogProps {
  projectId: string
  projectSlug?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (taskId: string) => void
  /** Called when user submits for /issue decomposition flow (if available) */
  onDecompose?: (description: string, images: string[]) => void
  /** Session key for the current chat - needed for /issue flow */
  sessionKey?: string
}

interface ImagePreview {
  id: string
  file: File
  url: string
  uploadedUrl?: string
  uploading: boolean
}

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
]

// Generate a UUID with fallback for non-secure contexts
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

export function NewIssueDialog({
  projectId,
  projectSlug,
  open,
  onOpenChange,
  onCreated,
  onDecompose,
  sessionKey,
}: NewIssueDialogProps) {
  // Form state
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<TaskPriority>("medium")
  const [images, setImages] = useState<ImagePreview[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [useDecomposition, setUseDecomposition] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Check if /issue flow is available (handler provided and session key exists)
  const canUseDecomposition = Boolean(onDecompose && sessionKey)

  const resetForm = useCallback(() => {
    setTitle("")
    setDescription("")
    setPriority("medium")
    setUseDecomposition(true)
    images.forEach((img) => URL.revokeObjectURL(img.url))
    setImages([])
  }, [images])

  const handleClose = useCallback(() => {
    resetForm()
    onOpenChange(false)
  }, [resetForm, onOpenChange])

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append("image", file)

    const response = await fetch("/api/upload/image", {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || "Failed to upload image")
    }

    const data = await response.json()
    return data.url
  }

  const handleImageUpload = async (file: File) => {
    const imageId = generateId()
    const imageUrl = URL.createObjectURL(file)

    const imagePreview: ImagePreview = {
      id: imageId,
      file,
      url: imageUrl,
      uploading: true,
    }

    setImages((prev) => [...prev, imagePreview])

    try {
      const uploadedUrl = await uploadImage(file)
      setImages((prev) =>
        prev.map((img) =>
          img.id === imageId ? { ...img, uploadedUrl, uploading: false } : img
        )
      )
    } catch (error) {
      console.error("Failed to upload image:", error)
      // Remove failed upload
      setImages((prev) => prev.filter((img) => img.id !== imageId))
      URL.revokeObjectURL(imageUrl)
      throw error
    }
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items

    for (let i = 0; i < items.length; i++) {
      const item = items[i]

      if (item.type.startsWith("image/")) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          await handleImageUpload(file)
        }
      }
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        await handleImageUpload(file)
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const removeImage = (imageId: string) => {
    setImages((prev) => {
      const image = prev.find((img) => img.id === imageId)
      if (image) {
        URL.revokeObjectURL(image.url)
      }
      return prev.filter((img) => img.id !== imageId)
    })
  }

  const buildDescriptionWithImages = (): string => {
    let fullDescription = description

    // Add image references to description
    const uploadedImages = images.filter((img) => img.uploadedUrl && !img.uploading)
    if (uploadedImages.length > 0) {
      if (fullDescription) {
        fullDescription += "\n\n"
      }
      fullDescription += uploadedImages
        .map((img) => `![image](${img.uploadedUrl})`)
        .join("\n")
    }

    return fullDescription
  }

  const buildIssueCommandText = (): string => {
    let text = description

    // Add title as a prefix if provided
    if (title.trim()) {
      text = `${title.trim()}\n\n${text}`
    }

    // Add image references
    const uploadedImages = images.filter((img) => img.uploadedUrl && !img.uploading)
    if (uploadedImages.length > 0) {
      if (text) {
        text += "\n\n"
      }
      text += uploadedImages
        .map((img) => `![image](${img.uploadedUrl})`)
        .join("\n")
    }

    // Add project flag if projectSlug is available
    if (projectSlug) {
      text += ` --project ${projectSlug}`
    }

    return text
  }

  const handleSubmit = async () => {
    if (isSubmitting) return

    // Description is required if title is empty
    if (!title.trim() && !description.trim()) {
      return
    }

    setIsSubmitting(true)

    try {
      // Upload any pending images first
      const pendingImages = images.filter((img) => !img.uploadedUrl && !img.uploading)
      for (const image of pendingImages) {
        const uploadedUrl = await uploadImage(image.file)
        setImages((prev) =>
          prev.map((img) => (img.id === image.id ? { ...img, uploadedUrl, uploading: false } : img))
        )
      }

      // Check if we should use decomposition flow
      if (useDecomposition && canUseDecomposition) {
        // Use /issue decomposition flow
        const issueText = buildIssueCommandText()
        const uploadedImageUrls = images
          .filter((img) => img.uploadedUrl && !img.uploading)
          .map((img) => img.uploadedUrl!)

        onDecompose?.(issueText, uploadedImageUrls)
        handleClose()
        return
      }

      // Fallback: Create single task directly
      const fullDescription = buildDescriptionWithImages()

      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          title: title.trim() || "New Issue",
          description: fullDescription || undefined,
          priority,
          status: "ready",
          role: "pm",
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create task")
      }

      const data = await response.json()
      const taskId = data.task.id

      if (onCreated) {
        onCreated(taskId)
      }

      handleClose()
    } catch (error) {
      console.error("Failed to create task:", error)
      // Keep form open for retry
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Escape key to close dialog
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handleClose])

  if (!open) return null

  const hasContent = title.trim() || description.trim() || images.length > 0
  const uploadingCount = images.filter((img) => img.uploading).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Create New Issue</h2>
            {canUseDecomposition && (
              <span className="text-xs bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                AI Decomposition
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Mode toggle - only show if decomposition is available */}
          {canUseDecomposition && (
            <div className="flex items-center gap-3 p-3 bg-[var(--bg-primary)] rounded-lg border border-[var(--border)]">
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {useDecomposition ? "AI Task Decomposition" : "Simple Task Creation"}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {useDecomposition
                    ? "An AI agent will break down your request into well-scoped tasks with dependencies"
                    : "Create a single task directly without AI assistance"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUseDecomposition(!useDecomposition)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    useDecomposition ? "bg-[var(--accent-blue)]" : "bg-[var(--border)]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      useDecomposition ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Title - show for both modes, but optional in decomposition mode */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--text-primary)]">
              Title {useDecomposition && canUseDecomposition ? (
                <span className="text-[var(--text-muted)]">(optional)</span>
              ) : (
                <span className="text-red-500">*</span>
              )}
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={useDecomposition && canUseDecomposition
                ? "Brief summary (AI will generate detailed titles)"
                : "Brief summary of the issue"
              }
              className="bg-[var(--bg-primary)] border-[var(--border)]"
            />
          </div>

          {/* Priority - only show in simple mode or when decomposition is unavailable */}
          {(!useDecomposition || !canUseDecomposition) && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--text-primary)]">Priority</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger className="w-40 bg-[var(--bg-primary)] border-[var(--border)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Description with image paste/drop support */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--text-primary)]">
              Description {useDecomposition && canUseDecomposition && (
                <span className="text-[var(--text-muted)]">- Describe what you want in natural language</span>
              )}
            </label>
            <div
              className={`relative rounded-lg border-2 border-dashed transition-colors ${
                dragOver
                  ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/5"
                  : "border-[var(--border)]"
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <Textarea
                ref={textareaRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onPaste={handlePaste}
                placeholder={useDecomposition && canUseDecomposition
                  ? "Describe the feature or issue in natural language. The AI will break it down into tasks.\n\nExample: \"Add a dark mode toggle to the settings page that syncs across devices\""
                  : "Describe the issue... (Markdown supported, paste images with Ctrl+V or drag & drop)"
                }
                rows={useDecomposition && canUseDecomposition ? 10 : 8}
                className="bg-[var(--bg-primary)] border-0 resize-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />

              {/* Drag overlay */}
              {dragOver && (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-primary)]/90 rounded-lg">
                  <div className="flex items-center gap-2 text-[var(--accent-blue)]">
                    <ImageIcon className="h-6 w-6" />
                    <span className="text-sm font-medium">Drop images here</span>
                  </div>
                </div>
              )}
            </div>

            {/* Upload hint */}
            <p className="text-xs text-[var(--text-muted)]">
              Paste images with Ctrl+V or drag & drop files
              {useDecomposition && canUseDecomposition && " — Images will be included as context for the AI"}
            </p>

            {/* Image previews */}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {images.map((image) => (
                  <div key={image.id} className="relative group">
                    <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-[var(--border)]">
                      <img
                        src={image.url}
                        alt="Upload preview"
                        className="w-full h-full object-cover"
                      />
                      {image.uploading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="h-5 w-5 text-white animate-spin" />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeImage(image.id)}
                      disabled={isSubmitting}
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center disabled:opacity-50"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border)] p-4 flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!hasContent || isSubmitting || uploadingCount > 0}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {useDecomposition && canUseDecomposition ? "Starting..." : "Creating..."}
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {useDecomposition && canUseDecomposition ? "Decompose with AI" : "Create Issue"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
