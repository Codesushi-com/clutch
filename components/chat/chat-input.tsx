"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Square, X, Command, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ContextIndicator } from "@/components/chat/context-indicator"
import { SlashCommandAutocomplete } from "@/components/chat/slash-command-autocomplete"
import { parseSlashCommand, executeSlashCommand, SLASH_COMMANDS, type SlashCommandResult } from "@/lib/slash-commands"

// Generate a UUID with fallback for non-secure contexts
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  // Fallback for browsers/contexts without crypto.randomUUID
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
  }
  // Last resort fallback
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

interface ImagePreview {
  id: string
  file: File
  url: string
  uploading: boolean
  uploadedUrl?: string
}

interface ChatInputProps {
  onSend: (content: string, images?: string[]) => Promise<void>
  onStop?: () => Promise<void>
  onSlashCommand?: (result: SlashCommandResult) => void
  onReset?: () => void
  disabled?: boolean
  placeholder?: string
  isAssistantTyping?: boolean
  sessionKey?: string
  projectId?: string
  lastSentAt?: number | null
}

export function ChatInput({
  onSend,
  onStop,
  onSlashCommand,
  onReset,
  disabled = false,
  placeholder = "Type a message...",
  isAssistantTyping = false,
  sessionKey = "main",
  projectId,
  lastSentAt = null,
}: ChatInputProps) {
  const [content, setContent] = useState("")
  const [sending, setSending] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [contextUpdateTrigger, setContextUpdateTrigger] = useState(0)
  const [images, setImages] = useState<ImagePreview[]>([])
  const [slashCommandMode, setSlashCommandMode] = useState<{
    active: boolean;
    command?: string;
    valid: boolean;
  }>({ active: false, valid: false })
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputContainerRef = useRef<HTMLDivElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [content])

  // Restore focus when textarea becomes enabled after sending
  useEffect(() => {
    if (!sending && !disabled) {
      textareaRef.current?.focus()
    }
  }, [sending, disabled])

  // Detect slash command mode and control autocomplete visibility
  useEffect(() => {
    const trimmed = content.trim()
    // Show autocomplete if content starts with "/" and we're at the beginning of input
    // (either the whole input starts with /, or we're at the start of a new line after \n)
    const lines = content.split("\n")
    const lastLine = lines[lines.length - 1]
    const isAtStartOfLine = lastLine.startsWith("/")

    if (isAtStartOfLine && !/^\/\S+\s/.test(lastLine)) {
      // Don't show autocomplete if there's already a space after the command (e.g., "/new ")
      const parsed = parseSlashCommand(trimmed)
      const knownCommands = Object.keys(SLASH_COMMANDS)
      setSlashCommandMode({
        active: true,
        command: parsed.command,
        valid: knownCommands.includes(parsed.command || ""),
      })
      setShowAutocomplete(true)
    } else {
      setSlashCommandMode({ active: false, valid: false })
      setShowAutocomplete(false)
    }
  }, [content])

  // Commands that require arguments — Tab fills them in with a trailing space
  // instead of immediately submitting.
  const COMMANDS_WITH_REQUIRED_ARGS = new Set(["issue", "model"])

  const handleAutocompleteSelect = (command: string) => {
    const lines = content.split("\n")
    const cmdName = command.replace("/", "")

    if (COMMANDS_WITH_REQUIRED_ARGS.has(cmdName)) {
      // Fill in command with trailing space so user can type args
      lines[lines.length - 1] = `${command} `
      const finalContent = lines.join("\n")
      setContent(finalContent)
      setShowAutocomplete(false)
      // Focus the textarea so user can keep typing
      setTimeout(() => textareaRef.current?.focus(), 0)
    } else {
      // No required args — submit immediately
      lines[lines.length - 1] = command
      const finalContent = lines.join("\n")
      setContent(finalContent)
      setShowAutocomplete(false)
      setTimeout(() => handleSendWithContent(finalContent), 0)
    }
  }

  const handleAutocompleteDismiss = () => {
    setShowAutocomplete(false)
    textareaRef.current?.focus()
  }

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append("image", file)

    const response = await fetch("/api/upload/image", {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`)
    }

    const data = await response.json()
    return data.url
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items

    for (let i = 0; i < items.length; i++) {
      const item = items[i]

      // Check if item is an image
      if (item.type.startsWith("image/")) {
        e.preventDefault()

        const file = item.getAsFile()
        if (!file) continue

        // Create preview
        const imageId = generateId()
        const imageUrl = URL.createObjectURL(file)

        const imagePreview: ImagePreview = {
          id: imageId,
          file,
          url: imageUrl,
          uploading: false,
        }

        setImages(prev => [...prev, imagePreview])
      }
    }
  }

  const removeImage = (imageId: string) => {
    setImages(prev => {
      const updated = prev.filter(img => img.id !== imageId)
      // Clean up object URL for removed image
      const removed = prev.find(img => img.id === imageId)
      if (removed) {
        URL.revokeObjectURL(removed.url)
      }
      return updated
    })
  }

  // Core send logic, accepts optional content override (used by autocomplete)
  const handleSendWithContent = async (overrideContent?: string) => {
    const messageText = (overrideContent ?? content).trim()
    if ((!messageText && images.length === 0) || sending || disabled || isAssistantTyping) return

    const imagesToUpload = [...images]

    // Check if this is a slash command
    const parsedCommand = parseSlashCommand(messageText)
    if (parsedCommand.isCommand) {
      // Execute slash command
      setSending(true)
      try {
        const result = await executeSlashCommand(parsedCommand, sessionKey)

        // Notify parent component of the result
        onSlashCommand?.(result)

        // Clear input if command was processed
        if (!result.shouldSendMessage) {
          setContent("")
        } else {
          // Unknown command - send as message after showing warning
          await onSend(messageText, undefined)
          setContent("")
        }
      } catch (error) {
        console.error("Slash command failed:", error)
        // Keep content on error so user can retry
      } finally {
        setSending(false)
      }
      return
    }

    // Clear inputs immediately for responsiveness
    setContent("")
    setImages([])
    setSending(true)

    try {
      // Upload images if any
      let uploadedUrls: string[] = []

      if (imagesToUpload.length > 0) {
        // Update image states to show uploading
        setImages(prev => prev.map(img => ({ ...img, uploading: true })))

        uploadedUrls = await Promise.all(
          imagesToUpload.map(async (img) => {
            try {
              const url = await uploadImage(img.file)
              return url
            } catch (error) {
              console.error("Failed to upload image:", error)
              throw error
            }
          })
        )
      }

      // Send message with uploaded image URLs
      await onSend(messageText, uploadedUrls.length > 0 ? uploadedUrls : undefined)

      // Clean up object URLs
      imagesToUpload.forEach(img => URL.revokeObjectURL(img.url))

      // Trigger context update after successful send
      setContextUpdateTrigger(prev => prev + 1)
    } catch (error) {
      // Restore content and images if send failed
      setContent(messageText)
      setImages(imagesToUpload.map(img => ({ ...img, uploading: false })))
      console.error("Failed to send message:", error)
    } finally {
      setSending(false)
    }
  }

  // Default send handler (uses current content state)
  const handleSend = () => handleSendWithContent()

  const handleStop = async () => {
    if (!onStop || stopping) return

    setStopping(true)
    try {
      await onStop()
    } catch (error) {
      console.error("Failed to stop chat:", error)
    } finally {
      setStopping(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't handle Enter for sending if autocomplete is visible
    // (the autocomplete component handles its own Enter key)
    if (showAutocomplete && (e.key === "Enter" || e.key === "Tab" || e.key === "Escape")) {
      // Let the autocomplete handle these keys
      return
    }

    // Cmd/Ctrl + Enter to send
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleSend()
    }
    // Enter without modifier sends (Shift+Enter for newline)
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach(img => URL.revokeObjectURL(img.url))
    }
  }, [])

  const hasContent = content.trim() || images.length > 0

  return (
    <div className="border-t border-[var(--border)] p-2 md:p-3">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {images.map(image => (
            <div key={image.id} className="relative group">
              <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-[var(--border)]">
                <img
                  src={image.url}
                  alt="Image preview"
                  className="w-full h-full object-cover"
                />
                {image.uploading && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  </div>
                )}
                <Button
                  onClick={() => removeImage(image.id)}
                  size="sm"
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  disabled={image.uploading}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Slash command indicator (shown when not using autocomplete or for unknown commands) */}
      {slashCommandMode.active && !showAutocomplete && (
        <div className={`mb-1.5 flex items-center gap-2 text-xs px-2 py-1 rounded-lg ${slashCommandMode.valid ? 'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
          {slashCommandMode.valid ? (
            <>
              <Command className="h-3.5 w-3.5" />
              <span>
                Command: <code className="font-mono bg-black/5 dark:bg-white/10 px-1 rounded">/{slashCommandMode.command}</code>
                {' '}— Press Enter to execute
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="h-3.5 w-3.5" />
              <span>
                Unknown command: <code className="font-mono bg-black/5 dark:bg-white/10 px-1 rounded">/{slashCommandMode.command}</code>
                {' '}— Will send as message
              </span>
            </>
          )}
        </div>
      )}

      {/* Chat input and send button container - aligned to top */}
      <div className="flex gap-2 md:gap-3 items-start">
        <div className="flex-1 relative" ref={inputContainerRef}>
          {/* Slash command autocomplete */}
          <SlashCommandAutocomplete
            inputValue={content}
            onSelect={handleAutocompleteSelect}
            onDismiss={handleAutocompleteDismiss}
            isVisible={showAutocomplete}
          />

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={disabled || sending}
            rows={1}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 md:px-4 py-3 text-sm md:text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)] resize-none touch-manipulation min-h-[44px]"
          />
        </div>

        {isAssistantTyping ? (
          <Button
            onClick={handleStop}
            disabled={!onStop || stopping}
            size="lg"
            variant="destructive"
            className="rounded-xl h-[44px] w-[44px] flex-shrink-0 touch-manipulation"
            title="Stop response"
          >
            {stopping ? (
              <div className="animate-spin rounded-full h-4 w-4 md:h-5 md:w-5 border-2 border-white border-t-transparent" />
            ) : (
              <Square className="h-4 w-4 md:h-5 md:w-5" />
            )}
          </Button>
        ) : (
          <Button
            onClick={handleSend}
            disabled={!hasContent || sending || disabled}
            size="lg"
            className="rounded-xl h-[44px] w-[44px] flex-shrink-0 touch-manipulation"
          >
            {sending ? (
              <div className="animate-spin rounded-full h-4 w-4 md:h-5 md:w-5 border-2 border-white border-t-transparent" />
            ) : (
              <Send className="h-4 w-4 md:h-5 md:w-5" />
            )}
          </Button>
        )}
      </div>

      {/* Context indicator */}
      <div className="mt-1.5 md:mt-2">
        <ContextIndicator
          sessionKey={sessionKey}
          projectId={projectId}
        />
      </div>

      <p className="text-sm text-[var(--text-muted)] hidden md:block mt-1 leading-tight">
        Press Enter to send, Shift+Enter for newline • Paste images with Cmd+V • Use /help for commands
      </p>
    </div>
  )
}
