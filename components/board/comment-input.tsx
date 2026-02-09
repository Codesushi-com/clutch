"use client"

import { useState, useRef, useEffect } from "react"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CommentInputProps {
  onSubmit: (content: string) => Promise<void>
  placeholder?: string
  disabled?: boolean
}

export function CommentInput({ 
  onSubmit, 
  placeholder = "Add a comment...",
  disabled = false,
}: CommentInputProps) {
  const [content, setContent] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [content])

  const handleSubmit = async () => {
    if (!content.trim() || submitting || disabled) return
    
    setSubmitting(true)
    try {
      await onSubmit(content.trim())
      setContent("")
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to submit
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || submitting}
          rows={1}
          className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)] resize-none min-h-[40px] max-h-[200px]"
        />
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Press ⌘+Enter to send
        </p>
      </div>
      
      <Button
        onClick={handleSubmit}
        disabled={!content.trim() || submitting || disabled}
        size="sm"
        className="flex-shrink-0"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  )
}
