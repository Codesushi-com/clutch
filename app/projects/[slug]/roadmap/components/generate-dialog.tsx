"use client"

import { useState } from "react"
import { X, AlertTriangle } from "lucide-react"
import type { RoadmapDepth } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"

interface GenerateDialogProps {
  onGenerate: (depth: RoadmapDepth) => void
  onCancel: () => void
}

const DEPTH_OPTIONS: { value: RoadmapDepth; label: string; description: string; phases: string }[] = [
  {
    value: "quick",
    label: "Quick",
    description: "Aggressive grouping, critical path only",
    phases: "3-5 phases",
  },
  {
    value: "standard",
    label: "Standard",
    description: "Balanced grouping",
    phases: "5-8 phases",
  },
  {
    value: "comprehensive",
    label: "Comprehensive",
    description: "Let natural boundaries stand",
    phases: "8-12 phases",
  },
]

export function GenerateDialog({ onGenerate, onCancel }: GenerateDialogProps) {
  const [depth, setDepth] = useState<RoadmapDepth>("standard")
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async () => {
    setGenerating(true)
    await onGenerate(depth)
    setGenerating(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              Generate Roadmap
            </h2>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/50 rounded-md p-3 flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-secondary)]">
              This will create new phases based on your requirements. 
              Existing phases will not be modified.
            </p>
          </div>

          <div className="space-y-3">
            <Label>Select Depth</Label>
            <div className="space-y-2">
              {DEPTH_OPTIONS.map((option) => {
                const selected = depth === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDepth(option.value)}
                    className={`w-full text-left flex items-start gap-3 p-3 rounded-md border transition-colors ${
                      selected
                        ? "border-[var(--accent-blue)] bg-[var(--bg-tertiary)]"
                        : "border-[var(--border)] hover:border-[var(--accent-blue)]"
                    }`}
                  >
                    <div className={`mt-1 h-4 w-4 rounded-full border flex items-center justify-center ${
                      selected ? "border-[var(--accent-blue)]" : "border-[var(--border)]"
                    }`}>
                      {selected && <div className="h-2 w-2 rounded-full bg-[var(--accent-blue)]" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-[var(--text-primary)]">{option.label}</div>
                      <p className="text-sm text-[var(--text-muted)]">{option.description}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">{option.phases}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border)]">
            <Button variant="outline" onClick={onCancel} disabled={generating}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? "Generating..." : "Generate"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
