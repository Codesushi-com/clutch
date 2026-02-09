"use client"

import { useState } from "react"
import { ChevronRight, ChevronDown, Copy, Check } from "lucide-react"

interface ToolCallBlockProps {
  tool: string
  params: Record<string, unknown>
  result?: string
  error?: string
}

export function ToolCallBlock({ tool, params, result, error }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const text = result || JSON.stringify(params, null, 2)
    await navigator.clipboard?.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Generate summary from params
  const summary = Object.entries(params)
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
    .join(", ")

  return (
    <div className="my-2 border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg-primary)]">
      {/* Header - clickable */}
      <div 
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
        )}
        
        <span className="text-xs font-medium text-[var(--accent-blue)]">
          Tool: {tool}
        </span>
        
        {!expanded && summary && (
          <span className="text-xs text-[var(--text-muted)] truncate">
            ({summary})
          </span>
        )}
        
        <button
          onClick={handleCopy}
          className="ml-auto p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors"
        >
          {copied ? (
            <Check className="h-3 w-3 text-[var(--accent-green)]" />
          ) : (
            <Copy className="h-3 w-3 text-[var(--text-muted)]" />
          )}
        </button>
      </div>
      
      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-[var(--border)] p-3 space-y-2">
          {/* Params */}
          <div>
            <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">
              Parameters
            </div>
            <pre className="text-xs text-[var(--text-primary)] bg-[var(--bg-tertiary)] rounded p-2 overflow-x-auto">
              {JSON.stringify(params, null, 2)}
            </pre>
          </div>
          
          {/* Result */}
          {result && (
            <div>
              <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">
                Result
              </div>
              <pre className="text-xs text-[var(--text-primary)] bg-[var(--bg-tertiary)] rounded p-2 overflow-x-auto max-h-[300px]">
                {result.length > 2000 ? result.slice(0, 2000) + "\n... (truncated)" : result}
              </pre>
            </div>
          )}
          
          {/* Error */}
          {error && (
            <div>
              <div className="text-xs font-medium text-red-500 mb-1">
                Error
              </div>
              <pre className="text-xs text-red-400 bg-red-500/10 rounded p-2 overflow-x-auto">
                {error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
