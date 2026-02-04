"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Square, X, Image as ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ContextIndicator } from "@/components/chat/context-indicator"

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
  disabled?: boolean
  placeholder?: string
  isAssistantTyping?: boolean
}

export function ChatInput({ 
  onSend, 
  onStop,
  disabled = false,
  placeholder = "Type a message...",
  isAssistantTyping = false,
}: ChatInputProps) {
  const [content, setContent] = useState("")
  const [sending, setSending] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [contextUpdateTrigger, setContextUpdateTrigger] = useState(0)
  const [images, setImages] = useState<ImagePreview[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [content])

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
        const imageId = crypto.randomUUID()
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

  const handleSend = async () => {
    if ((!content.trim() && images.length === 0) || sending || disabled || isAssistantTyping) return
    
    const message = content.trim()
    const imagesToUpload = [...images]
    
    // Clear inputs immediately for responsiveness
    setContent("")
    setImages([])
    setSending(true)
    
    // Keep focus on input after clearing
    textareaRef.current?.focus()
    
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
      await onSend(message, uploadedUrls.length > 0 ? uploadedUrls : undefined)
      
      // Clean up object URLs
      imagesToUpload.forEach(img => URL.revokeObjectURL(img.url))
      
      // Trigger context update after successful send
      setContextUpdateTrigger(prev => prev + 1)
    } catch (error) {
      // Restore content and images if send failed
      setContent(message)
      setImages(imagesToUpload.map(img => ({ ...img, uploading: false })))
      console.error("Failed to send message:", error)
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

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
    <div className="border-t border-[var(--border)] p-3 md:p-4">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
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
      
      {/* Chat input and send button container - aligned center for better visual balance */}
      <div className="flex gap-2 md:gap-3 items-center">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={disabled || sending}
            rows={1}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 md:px-4 py-3 text-sm md:text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)] resize-none touch-manipulation"
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
            <Square className="h-4 w-4 md:h-5 md:w-5" />
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
      <div className="mt-2 md:mt-3 mb-1 md:mb-2">
        <ContextIndicator 
          sessionKey="main"
          key={contextUpdateTrigger} // Force re-fetch when trigger updates
        />
      </div>
      
      <p className="text-xs text-[var(--text-muted)] hidden md:block">
        Press Enter to send, Shift+Enter for newline • Paste images with Cmd+V
      </p>
    </div>
  )
}// Updated
