"use client"

import { useState } from "react"
import { MoreHorizontal, ClipboardList, Copy, Check } from "lucide-react"
import type { ChatMessage } from "@/lib/db/types"

interface MessageActionsProps {
  message: ChatMessage
  onCreateTask: (message: ChatMessage) => void
}

export function MessageActions({ message, onCreateTask }: MessageActionsProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    setShowMenu(false)
  }

  const handleCreateTask = () => {
    onCreateTask(message)
    setShowMenu(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-tertiary)] transition-all"
      >
        <MoreHorizontal className="h-4 w-4 text-[var(--text-muted)]" />
      </button>
      
      {showMenu && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          
          {/* Menu */}
          <div className="absolute right-0 top-full mt-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-lg z-20 py-1 min-w-[160px]">
            <button
              onClick={handleCreateTask}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <ClipboardList className="h-4 w-4" />
              Create Task
            </button>
            
            <button
              onClick={handleCopy}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-[var(--accent-green)]" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy Text
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
