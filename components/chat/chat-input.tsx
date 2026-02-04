"use client"

import { useState, useRef, useEffect } from "react"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ContextIndicator } from "@/components/chat/context-indicator"

interface ChatInputProps {
  onSend: (content: string) => Promise<void>
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({ 
  onSend, 
  disabled = false,
  placeholder = "Type a message...",
}: ChatInputProps) {
  const [content, setContent] = useState("")
  const [sending, setSending] = useState(false)
  const [contextUpdateTrigger, setContextUpdateTrigger] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [content])

  const handleSend = async () => {
    if (!content.trim() || sending || disabled) return
    
    const message = content.trim()
    setContent("") // Clear immediately for responsiveness
    setSending(true)
    
    try {
      await onSend(message)
      // Trigger context update after successful send
      setContextUpdateTrigger(prev => prev + 1)
    } catch {
      // Restore content if send failed
      setContent(message)
    } finally {
      setSending(false)
      textareaRef.current?.focus()
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

  return (
    <div className="border-t border-[var(--border)] p-4">
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || sending}
            rows={1}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)] resize-none"
          />
        </div>
        
        <Button
          onClick={handleSend}
          disabled={!content.trim() || sending || disabled}
          size="lg"
          className="rounded-xl"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Context indicator */}
      <div className="mt-3 mb-2">
        <ContextIndicator 
          sessionKey="main"
          key={contextUpdateTrigger} // Force re-fetch when trigger updates
        />
      </div>
      
      <p className="text-xs text-[var(--text-muted)]">
        Press Enter to send, Shift+Enter for newline
      </p>
    </div>
  )
}
