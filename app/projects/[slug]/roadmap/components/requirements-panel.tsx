"use client"

import { useState } from "react"
import { Plus, Trash2, Link2, Unlink, Edit } from "lucide-react"
import type { Requirement, RoadmapPhase } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface RequirementsPanelProps {
  projectId: string
  requirements: Requirement[]
  phases: RoadmapPhase[]
  phaseRequirements: Array<{ phase_id: string; requirement_id: string }>
  onUpdate: () => void
}

export function RequirementsPanel({
  projectId,
  requirements,
  phases,
  phaseRequirements,
  onUpdate,
}: RequirementsPanelProps) {
  const [showNew, setShowNew] = useState(false)
  const [editingReq, setEditingReq] = useState<Requirement | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("")
  const [priority, setPriority] = useState<Requirement['priority']>('medium')

  const getMappedPhase = (reqId: string) => {
    const mapping = phaseRequirements.find((pr) => pr.requirement_id === reqId)
    if (!mapping) return null
    return phases.find((p) => p.id === mapping.phase_id) || null
  }

  const handleCreate = async () => {
    if (!title.trim()) return

    try {
      const response = await fetch('/api/roadmap/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          title: title.trim(),
          description: description.trim() || undefined,
          category: category.trim() || undefined,
          priority,
          status: 'approved',
        }),
      })

      if (response.ok) {
        setTitle("")
        setDescription("")
        setCategory("")
        setPriority('medium')
        setShowNew(false)
        onUpdate()
      }
    } catch (err) {
      console.error('Failed to create requirement:', err)
    }
  }

  const handleUpdate = async () => {
    if (!editingReq || !title.trim()) return

    try {
      const response = await fetch('/api/roadmap/requirements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingReq.id,
          title: title.trim(),
          description: description.trim() || null,
          category: category.trim() || null,
          priority,
        }),
      })

      if (response.ok) {
        setEditingReq(null)
        setShowNew(false)
        setTitle("")
        setDescription("")
        setCategory("")
        onUpdate()
      }
    } catch (err) {
      console.error('Failed to update requirement:', err)
    }
  }

  const handleDelete = async (reqId: string) => {
    try {
      const response = await fetch(`/api/roadmap/requirements?id=${reqId}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        onUpdate()
      }
    } catch (err) {
      console.error('Failed to delete requirement:', err)
    }
  }

  const handleLink = async (reqId: string, phaseId: string) => {
    try {
      const response = await fetch('/api/roadmap/phase-requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase_id: phaseId,
          requirement_id: reqId,
          project_id: projectId,
        }),
      })
      if (response.ok) {
        onUpdate()
      }
    } catch (err) {
      console.error('Failed to link requirement:', err)
    }
  }

  const handleUnlink = async (reqId: string, phaseId: string) => {
    try {
      const response = await fetch(
        `/api/roadmap/phase-requirements?phase_id=${phaseId}&requirement_id=${reqId}`,
        { method: 'DELETE' }
      )
      if (response.ok) {
        onUpdate()
      }
    } catch (err) {
      console.error('Failed to unlink requirement:', err)
    }
  }

  const startEdit = (req: Requirement) => {
    setEditingReq(req)
    setShowNew(true)
    setTitle(req.title)
    setDescription(req.description || "")
    setCategory(req.category || "")
    setPriority(req.priority)
  }

  const cancelEdit = () => {
    setEditingReq(null)
    setShowNew(false)
    setTitle("")
    setDescription("")
    setCategory("")
    setPriority('medium')
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-medium text-[var(--text-primary)]">Requirements</h3>
          <p className="text-sm text-[var(--text-muted)]">
            Create requirements and map each to exactly one phase
          </p>
        </div>
        <Button size="sm" onClick={() => setShowNew(!showNew)}>
          <Plus className="h-4 w-4 mr-1" />
          {showNew ? "Close" : "Add"}
        </Button>
      </div>

      {showNew && (
        <div className="mb-6 p-4 border border-[var(--border)] rounded-md space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-[var(--text-primary)]">
              {editingReq ? "Edit Requirement" : "New Requirement"}
            </h4>
            {editingReq && (
              <Button variant="ghost" size="sm" onClick={cancelEdit}>
                Cancel
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="AUTH, CONTENT, ..." />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Requirement['priority'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={cancelEdit}>
              Reset
            </Button>
            <Button onClick={editingReq ? handleUpdate : handleCreate}>
              {editingReq ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {requirements.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)] text-center py-8">
            No requirements yet. Add some to generate a roadmap.
          </div>
        ) : (
          requirements
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((req) => {
              const mappedPhase = getMappedPhase(req.id)

              return (
                <Card key={req.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-[var(--text-muted)]">
                          {req.id.slice(0, 8)}
                        </span>
                        <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {req.title}
                        </span>
                        {req.category && (
                          <Badge variant="secondary" className="text-xs">
                            {req.category}
                          </Badge>
                        )}
                      </div>
                      {req.description && (
                        <p className="text-sm text-[var(--text-muted)] mt-1 line-clamp-2">
                          {req.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(req)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500"
                        onClick={() => handleDelete(req.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-sm">
                      {mappedPhase ? (
                        <>
                          <Link2 className="h-4 w-4 text-green-500" />
                          <span className="text-[var(--text-secondary)]">
                            Phase {mappedPhase.number}: {mappedPhase.name}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnlink(req.id, mappedPhase.id)}
                          >
                            <Unlink className="h-4 w-4 mr-1" />
                            Unlink
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-[var(--text-muted)]">Not mapped</span>
                        </>
                      )}
                    </div>

                    <Select
                      value={mappedPhase?.id || ""}
                      onValueChange={(phaseId) => handleLink(req.id, phaseId)}
                    >
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Map to phase..." />
                      </SelectTrigger>
                      <SelectContent>
                        {phases
                          .slice()
                          .sort((a, b) => a.position - b.position)
                          .map((phase) => (
                            <SelectItem key={phase.id} value={phase.id}>
                              Phase {phase.number}: {phase.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </Card>
              )
            })
        )}
      </div>
    </Card>
  )
}
