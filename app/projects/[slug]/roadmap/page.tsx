"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { Map, Plus, AlertCircle, CheckCircle, Download, RefreshCw, ChevronDown, ChevronRight } from "lucide-react"
import type { RoadmapPhase, Requirement, RoadmapCoverage } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PhaseCard } from "./components/phase-card"
import { PhaseEditor } from "./components/phase-editor"
import { RequirementsPanel } from "./components/requirements-panel"
import { GenerateDialog } from "./components/generate-dialog"
import { CoverageBadge } from "./components/coverage-badge"

interface RoadmapData {
  phases: RoadmapPhase[]
  requirements: Requirement[]
  phaseRequirements: Array<{ id: string; phase_id: string; requirement_id: string }>
  coverage: RoadmapCoverage & { unmapped: string[] }
}

export default function RoadmapPage() {
  const { slug } = useParams<{ slug: string }>()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [roadmap, setRoadmap] = useState<RoadmapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPhase, setSelectedPhase] = useState<RoadmapPhase | null>(null)
  const [editingPhase, setEditingPhase] = useState<RoadmapPhase | null>(null)
  const [showGenerate, setShowGenerate] = useState(false)
  const [showRequirements, setShowRequirements] = useState(false)
  const [reordering, setReordering] = useState(false)

  // Fetch project ID from slug
  useEffect(() => {
    async function fetchProject() {
      try {
        const response = await fetch(`/api/projects/${slug}`)
        if (response.ok) {
          const data = await response.json()
          setProjectId(data.project.id)
        }
      } catch {
        setError("Failed to load project")
      }
    }
    fetchProject()
  }, [slug])

  // Fetch roadmap data
  const fetchRoadmap = useCallback(async () => {
    if (!projectId) return
    
    setLoading(true)
    try {
      const response = await fetch(`/api/roadmap?project_id=${projectId}`)
      if (response.ok) {
        const data = await response.json()
        setRoadmap(data)
        setError(null)
      } else {
        setError("Failed to load roadmap")
      }
    } catch {
      setError("Failed to load roadmap")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchRoadmap()
  }, [fetchRoadmap])

  const handlePhaseUpdate = async (phaseId: string, updates: Partial<RoadmapPhase>) => {
    try {
      const response = await fetch('/api/roadmap/phases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: phaseId, ...updates }),
      })
      
      if (response.ok) {
        fetchRoadmap()
        setEditingPhase(null)
      }
    } catch (err) {
      console.error('Failed to update phase:', err)
    }
  }

  const handleReorder = async (phaseIds: string[]) => {
    if (!projectId) return
    
    setReordering(true)
    try {
      const response = await fetch('/api/roadmap/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, phase_ids: phaseIds }),
      })
      
      if (response.ok) {
        fetchRoadmap()
      }
    } catch (err) {
      console.error('Failed to reorder phases:', err)
    } finally {
      setReordering(false)
    }
  }

  const handleExport = async () => {
    if (!projectId) return
    
    try {
      const response = await fetch(`/api/roadmap/export?project_id=${projectId}`)
      if (response.ok) {
        const data = await response.json()
        // Download as JSON
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `roadmap-${slug}.json`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Failed to export roadmap:', err)
    }
  }

  const handleGenerate = async (depth: 'quick' | 'standard' | 'comprehensive') => {
    if (!projectId) return
    
    try {
      const response = await fetch('/api/roadmap/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, depth }),
      })
      
      if (response.ok) {
        fetchRoadmap()
        setShowGenerate(false)
      }
    } catch (err) {
      console.error('Failed to generate roadmap:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        <AlertCircle className="h-6 w-6 mr-2" />
        {error}
      </div>
    )
  }

  const hasPhases = roadmap && roadmap.phases.length > 0
  const coverage = roadmap?.coverage

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Map className="h-6 w-6 text-[var(--accent-blue)]" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Roadmap</h1>
            <p className="text-sm text-[var(--text-muted)]">
              GSD-style phase breakdown with requirement mapping
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {coverage && <CoverageBadge coverage={coverage} />}
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRequirements(!showRequirements)}
          >
            {showRequirements ? (
              <><ChevronDown className="h-4 w-4 mr-1" /> Hide Requirements</>
            ) : (
              <><ChevronRight className="h-4 w-4 mr-1" /> Show Requirements</>
            )}
          </Button>
          
          {hasPhases && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          )}
          
          <Button size="sm" onClick={() => setShowGenerate(true)}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Generate
          </Button>
        </div>
      </div>

      {/* Coverage Warning */}
      {coverage && coverage.unmapped.length > 0 && (
        <Card className="p-4 border-amber-500/50 bg-amber-500/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <h3 className="font-medium text-amber-500">Incomplete Coverage</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                {coverage.unmapped.length} requirement{coverage.unmapped.length > 1 ? 's' : ''} not mapped to any phase.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Requirements Panel */}
      {showRequirements && projectId && (
        <RequirementsPanel
          projectId={projectId}
          requirements={roadmap?.requirements || []}
          phases={roadmap?.phases || []}
          phaseRequirements={roadmap?.phaseRequirements || []}
          onUpdate={fetchRoadmap}
        />
      )}

      {/* Phases List */}
      {hasPhases ? (
        <div className="space-y-4">
          {roadmap.phases
            .sort((a, b) => a.position - b.position)
            .map((phase, index) => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                index={index}
                total={roadmap.phases.length}
                requirements={roadmap.requirements}
                phaseRequirements={roadmap.phaseRequirements}
                onSelect={setSelectedPhase}
                onEdit={setEditingPhase}
                onReorder={handleReorder}
                allPhases={roadmap.phases}
                reordering={reordering}
              />
            ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <Map className="h-12 w-12 mx-auto text-[var(--text-muted)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
            No Roadmap Yet
          </h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Generate a roadmap from your requirements or create phases manually.
          </p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => setShowGenerate(true)}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Generate Roadmap
            </Button>
            <Button variant="outline" onClick={() => setShowRequirements(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Requirements
            </Button>
          </div>
        </Card>
      )}

      {/* Generate Dialog */}
      {showGenerate && (
        <GenerateDialog
          onGenerate={handleGenerate}
          onCancel={() => setShowGenerate(false)}
        />
      )}

      {/* Phase Editor */}
      {editingPhase && (
        <PhaseEditor
          phase={editingPhase}
          requirements={roadmap?.requirements || []}
          phaseRequirements={roadmap?.phaseRequirements || []}
          onSave={handlePhaseUpdate}
          onCancel={() => setEditingPhase(null)}
        />
      )}

      {/* Phase Detail View */}
      {selectedPhase && !editingPhase && (
        <PhaseDetailModal
          phase={selectedPhase}
          requirements={roadmap?.requirements || []}
          phaseRequirements={roadmap?.phaseRequirements || []}
          onClose={() => setSelectedPhase(null)}
        />
      )}
    </div>
  )
}

// Phase Detail Modal Component
function PhaseDetailModal({
  phase,
  requirements,
  phaseRequirements,
  onClose,
}: {
  phase: RoadmapPhase
  requirements: Requirement[]
  phaseRequirements: Array<{ phase_id: string; requirement_id: string }>
  onClose: () => void
}) {
  const mappedReqIds = phaseRequirements
    .filter((pr) => pr.phase_id === phase.id)
    .map((pr) => pr.requirement_id)
  
  const mappedRequirements = requirements.filter((r) => mappedReqIds.includes(r.id))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">
                Phase {phase.number}: {phase.name}
              </h2>
              <p className="text-sm text-[var(--text-muted)]">{phase.goal}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>

          {phase.description && (
            <div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">Description</h3>
              <p className="text-sm text-[var(--text-secondary)]">{phase.description}</p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">
              Success Criteria ({phase.success_criteria.length})
            </h3>
            <ul className="space-y-2">
              {phase.success_criteria.map((criterion, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[var(--text-secondary)]">{criterion}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">
              Mapped Requirements ({mappedRequirements.length})
            </h3>
            {mappedRequirements.length > 0 ? (
              <div className="space-y-2">
                {mappedRequirements.map((req) => (
                  <Card key={req.id} className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-[var(--text-muted)]">
                        {req.id.slice(0, 8)}
                      </span>
                      <span className="text-sm text-[var(--text-primary)]">{req.title}</span>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">No requirements mapped to this phase.</p>
            )}
          </div>

          {phase.depends_on.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">Dependencies</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Depends on {phase.depends_on.length} phase(s)
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
