'use client'

import { useState } from 'react'
import { FlaskConical, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { PromptVersion } from '../types'

interface ABStartDialogProps {
  isOpen: boolean
  onClose: () => void
  onStarted: () => void
  challenger: PromptVersion | null
}

export function ABStartDialog({ isOpen, onClose, onStarted, challenger }: ABStartDialogProps) {
  const [splitPercent, setSplitPercent] = useState(50)
  const [minTasks, setMinTasks] = useState(20)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleStart = async () => {
    if (!challenger) return

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/prompts/ab-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenger_id: challenger.id,
          split_percent: splitPercent,
          min_tasks: minTasks,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to start A/B test')
      }

      toast.success(`A/B test started: v${challenger.version} as challenger`)
      onStarted()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start A/B test')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-[var(--accent-purple)]" />
            Start A/B Test
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Test <strong>v{challenger?.version}</strong> as challenger against the current active version (control).
            Tasks will be randomly assigned to one version based on the split ratio.
          </p>

          <div>
            <label className="text-sm font-medium text-[var(--text-secondary)] mb-1.5 block">
              Challenger Traffic (%)
            </label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={99}
                value={splitPercent}
                onChange={(e) => setSplitPercent(Number(e.target.value))}
                className="w-24 bg-[var(--bg-tertiary)] border-[var(--border)]"
              />
              <div className="flex-1 text-xs text-[var(--text-muted)]">
                <span className="text-[var(--accent-blue)]">{100 - splitPercent}% control</span>
                {' · '}
                <span className="text-[var(--accent-purple)]">{splitPercent}% challenger</span>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--text-secondary)] mb-1.5 block">
              Minimum Tasks Before Evaluation
            </label>
            <Input
              type="number"
              min={1}
              max={1000}
              value={minTasks}
              onChange={(e) => setMinTasks(Number(e.target.value))}
              className="w-24 bg-[var(--bg-tertiary)] border-[var(--border)]"
            />
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Collect at least this many total task results before comparing
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border)]">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleStart}
            disabled={isSubmitting || !challenger}
            className="bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/80 text-white"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4 mr-2" />
            )}
            Start Test
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
