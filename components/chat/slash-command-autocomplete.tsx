"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Command, CornerDownLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { SLASH_COMMANDS, type SlashCommandName } from "@/lib/slash-commands"

interface SlashCommandAutocompleteProps {
  inputValue: string
  onSelect: (command: string) => void
  onDismiss: () => void
  isVisible: boolean
}

interface CommandItem {
  key: SlashCommandName
  name: string
  description: string
  usage: string
}

const COMMANDS: CommandItem[] = Object.entries(SLASH_COMMANDS).map(([key, cmd]) => ({
  key: key as SlashCommandName,
  name: cmd.name,
  description: cmd.description,
  usage: cmd.usage,
}))

export function SlashCommandAutocomplete({
  inputValue,
  onSelect,
  onDismiss,
  isVisible,
}: SlashCommandAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedItemRef = useRef<HTMLDivElement>(null)

  // Parse what the user has typed after "/"
  const searchTerm = inputValue.trim().startsWith("/")
    ? inputValue.trim().slice(1).toLowerCase()
    : ""

  // Filter commands based on search term
  const filteredCommands = useMemo(() => {
    const search = searchTerm.toLowerCase()
    return COMMANDS.filter((cmd) => {
      return (
        cmd.key.toLowerCase().includes(search) ||
        cmd.name.toLowerCase().includes(search) ||
        cmd.description.toLowerCase().includes(search)
      )
    })
  }, [searchTerm])

  // Clamp selected index to valid range - derived value, no setState needed
  const safeSelectedIndex = Math.min(selectedIndex, Math.max(0, filteredCommands.length - 1))

  // Scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current && containerRef.current) {
      selectedItemRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      })
    }
  }, [safeSelectedIndex])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isVisible || filteredCommands.length === 0) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setSelectedIndex((prev) =>
            Math.min(prev + 1, filteredCommands.length - 1)
          )
          break
        case "ArrowUp":
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        case "Enter":
        case "Tab":
          e.preventDefault()
          if (filteredCommands[safeSelectedIndex]) {
            onSelect(filteredCommands[safeSelectedIndex].name)
          }
          break
        case "Escape":
          e.preventDefault()
          onDismiss()
          break
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isVisible, filteredCommands, safeSelectedIndex, onSelect, onDismiss])

  const handleSelect = (command: string) => {
    setSelectedIndex(0)
    onSelect(command)
  }

  // Hide if no matches
  if (!isVisible || filteredCommands.length === 0) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-2 z-50"
    >
      <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden max-h-64 flex flex-col">
        {/* Header */}
        <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Command className="h-3.5 w-3.5" />
            <span>Commands</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <span className="hidden sm:inline">
              <kbd className="px-1.5 py-0.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded">↑↓</kbd>
              {" "}to navigate
            </span>
            <span className="hidden sm:inline">
              <kbd className="px-1.5 py-0.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded ml-1">↵</kbd>
              {" "}to select
            </span>
          </div>
        </div>

        {/* Command list */}
        <div className="overflow-y-auto py-1">
          {filteredCommands.map((cmd, index) => (
            <div
              key={cmd.key}
              ref={index === safeSelectedIndex ? selectedItemRef : null}
              onClick={() => handleSelect(cmd.name)}
              className={cn(
                "px-3 py-2.5 cursor-pointer flex items-start gap-3 transition-colors",
                index === safeSelectedIndex
                  ? "bg-[var(--accent-blue)]/10"
                  : "hover:bg-[var(--bg-secondary)]"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code
                    className={cn(
                      "font-mono text-sm font-medium",
                      index === safeSelectedIndex
                        ? "text-[var(--accent-blue)]"
                        : "text-[var(--text-primary)]"
                    )}
                  >
                    {cmd.name}
                  </code>
                  {index === safeSelectedIndex && (
                    <CornerDownLeft className="h-3 w-3 text-[var(--accent-blue)]" />
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                  {cmd.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer with usage hint for selected command */}
        {filteredCommands[safeSelectedIndex] && (
          <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--bg-secondary)]">
            <code className="text-xs text-[var(--text-muted)] font-mono">
              {filteredCommands[safeSelectedIndex].usage}
            </code>
          </div>
        )}
      </div>
    </div>
  )
}
