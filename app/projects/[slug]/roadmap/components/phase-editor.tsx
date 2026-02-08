"use client"

import { useState } from "react"
import { X, Plus, Trash2 } from "lucide-react"
import type { RoadmapPhase, Requirement } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface PhaseEditorProps {
  phase: RoadmapPhase
  requirements: Requirement[]
  phaseRequirements: Array<{ phase_id: string; requirement_id: string }>
  onSave: (phaseId: string, updates: Partial<RoadmapPhase>) => void
  onCancel: () => void
}

export function PhaseEditor({
  phase,
  requirements,
  phaseRequirements,
  onSave,
  onCancel,
}: PhaseEditorProps) {
  const [name, setName] = useState(phase.name)
  const [goal, setGoal] = useState(phase.goal)
  const [description, setDescription] = useState(phase.description || "")
  const [status, setStatus] = useState(phase.status)
  const [successCriteria, setSuccessCriteria] = useState<string[]>(phase.success_criteria)
  const [newCriterion, setNewCriterion] = useState("")

  const mappedReqIds = phaseRequirements
    .filter((pr) => pr.phase_id === phase.id)
    .map((pr) => pr.requirement_id)

  const handleAddCriterion = () => {
    if (newCriterion.trim()) {
      setSuccessCriteria([...successCriteria, newCriterion.trim()])
      setNewCriterion("")
    }
  }

  const handleRemoveCriterion = (index: number) => {
    setSuccessCriteria(successCriteria.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    onSave(phase.id, {
      name,
      goal,
      description: description || null,
      status,
      success_criteria: successCriteria,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              Edit Phase {phase.number}
            </h2>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Phase name"
              />
            </div>

            <div>
              <Label htmlFor="goal">Goal</Label>
              <Input
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="What this phase delivers"
              />
            </div>

            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional details about this phase"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as RoadmapPhase['status'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="deferred">Deferred</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Success Criteria */}
          <div className="space-y-3">
            <Label>Success Criteria</Label>
            <div className="space-y-2">
              {successCriteria.map((criterion, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-sm text-[var(--text-secondary)] flex-1">{criterion}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-500"
                    onClick={() => handleRemoveCriterion(idx)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCriterion}
                onChange={(e) => setNewCriterion(e.target.value)}
                placeholder="Add a success criterion..."
                onKeyDown={(e) => e.key === 'Enter' && handleAddCriterion()}
              />
              <Button type="button" onClick={handleAddCriterion}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Mapped Requirements */}
          <div className="space-y-2">
            <Label>Mapped Requirements ({mappedReqIds.length})</Label>
            <div className="flex flex-wrap gap-2">
              {mappedReqIds.length > 0 ? (
                requirements
                  .filter((r) => mappedReqIds.includes(r.id))
                  .map((req) => (
                    <Badge key={req.id} variant="secondary">
                      {req.title}
                    </Badge>
                  ))
              ) : (
                <span className="text-sm text-[var(--text-muted)]">
                  No requirements mapped to this phase
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border)]">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
