"use client"

import { useState } from "react"
import { ChevronUp, ChevronDown, Edit, GripVertical, CheckCircle, Link2 } from "lucide-react"
import type { RoadmapPhase, Requirement } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface PhaseCardProps {
  phase: RoadmapPhase
  index: number
  total: number
  requirements: Requirement[]
  phaseRequirements: Array<{ phase_id: string; requirement_id: string }>
  onSelect: (phase: RoadmapPhase) => void
  onEdit: (phase: RoadmapPhase) => void
  onReorder: (phaseIds: string[]) => void
  allPhases: RoadmapPhase[]
  reordering: boolean
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500",
  planned: "bg-blue-500",
  in_progress: "bg-yellow-500",
  completed: "bg-green-500",
  deferred: "bg-purple-500",
}

export function PhaseCard({
  phase,
  index,
  total,
  requirements,
  phaseRequirements,
  onSelect,
  onEdit,
  onReorder,
  allPhases,
  reordering,
}: PhaseCardProps) {
  const [isDragging] = useState(false)
  
  const mappedReqIds = phaseRequirements
    .filter((pr) => pr.phase_id === phase.id)
    .map((pr) => pr.requirement_id)
  
  const mappedRequirements = requirements.filter((r) => mappedReqIds.includes(r.id))

  const handleMoveUp = () => {
    if (index === 0) return
    const newOrder = [...allPhases]
    const temp = newOrder[index]
    newOrder[index] = newOrder[index - 1]
    newOrder[index - 1] = temp
    onReorder(newOrder.map((p) => p.id))
  }

  const handleMoveDown = () => {
    if (index === total - 1) return
    const newOrder = [...allPhases]
    const temp = newOrder[index]
    newOrder[index] = newOrder[index + 1]
    newOrder[index + 1] = temp
    onReorder(newOrder.map((p) => p.id))
  }

  return (
    <Card
      className={`relative transition-all ${
        isDragging ? "opacity-50" : ""
      } hover:border-[var(--accent-blue)]`}
    >
      <div className="p-4 sm:p-6">
        <div className="flex items-start gap-4">
          {/* Drag Handle / Move Controls */}
          <div className="flex flex-col items-center gap-1 pt-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={index === 0 || reordering}
              onClick={handleMoveUp}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <GripVertical className="h-5 w-5 text-[var(--text-muted)]" />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={index === total - 1 || reordering}
              onClick={handleMoveDown}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0" onClick={() => onSelect(phase)}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  Phase {phase.number}: {phase.name}
                </h3>
                {phase.inserted && (
                  <Badge variant="secondary" className="text-xs">Inserted</Badge>
                )}
              </div>
              <Badge className={`${STATUS_COLORS[phase.status]} text-white capitalize`}>
                {phase.status}
              </Badge>
            </div>

            <p className="text-sm text-[var(--text-muted)] mt-1 line-clamp-2">
              {phase.goal}
            </p>

            {/* Stats */}
            <div className="flex items-center gap-4 mt-3 text-sm text-[var(--text-secondary)]">
              <div className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                <span>{phase.success_criteria.length} criteria</span>
              </div>
              <div className="flex items-center gap-1">
                <Link2 className="h-4 w-4" />
                <span>{mappedRequirements.length} requirements</span>
              </div>
              {phase.depends_on.length > 0 && (
                <span className="text-[var(--text-muted)]">
                  Depends on {phase.depends_on.length}
                </span>
              )}
            </div>

            {/* Success Criteria Preview */}
            {phase.success_criteria.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--border)]">
                <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Success Criteria:</p>
                <ul className="space-y-1">
                  {phase.success_criteria.slice(0, 3).map((criterion, idx) => (
                    <li key={idx} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span>
                      <span className="line-clamp-1">{criterion}</span>
                    </li>
                  ))}
                  {phase.success_criteria.length > 3 && (
                    <li className="text-xs text-[var(--text-muted)]">
                      +{phase.success_criteria.length - 3} more
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation()
                onEdit(phase)
              }}
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
