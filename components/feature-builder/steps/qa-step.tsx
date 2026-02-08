"use client"

import { useMemo } from "react"
import { AlertCircle, CheckCircle2, Check } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import type { FeatureBuilderData } from "../feature-builder-types"

interface QAStepProps {
  data: Pick<FeatureBuilderData, "qaValidation" | "requirements" | "acceptanceCriteria" | "taskBreakdown"> 
  onChange: (data: Partial<Pick<FeatureBuilderData, "qaValidation">>) => void
}

export function QAStep({ data, onChange }: QAStepProps) {
  const checklist = data.qaValidation.checklist

  const totalTasks = useMemo(() => {
    return data.taskBreakdown?.phases.reduce((sum, p) => sum + p.tasks.length, 0) ?? 0
  }, [data.taskBreakdown])

  const hasMissingTesting = useMemo(() => {
    if (!data.taskBreakdown) return false
    const all = data.taskBreakdown.phases.flatMap((p) => p.tasks)
    return !all.some((t) => /test|testing|spec/i.test(t.title) || /test/i.test(t.description))
  }, [data.taskBreakdown])

  const hasMissingSetup = useMemo(() => {
    if (!data.taskBreakdown) return false
    const all = data.taskBreakdown.phases.flatMap((p) => p.tasks)
    return !all.some((t) => /setup|scaffold|bootstrap|init/i.test(t.title))
  }, [data.taskBreakdown])

  const hasDependencyIssues = useMemo(() => {
    if (!data.taskBreakdown) return false
    const tasks = data.taskBreakdown.phases.flatMap((p) => p.tasks)
    const idSet = new Set(tasks.map((t) => t.id))

    // invalid reference
    for (const t of tasks) {
      for (const dep of t.dependsOn) {
        if (!idSet.has(dep)) return true
      }
    }

    // cycle detection (DFS)
    const graph = new Map<string, string[]>()
    for (const t of tasks) graph.set(t.id, t.dependsOn)

    const visiting = new Set<string>()
    const visited = new Set<string>()

    const dfs = (id: string): boolean => {
      if (visiting.has(id)) return true
      if (visited.has(id)) return false
      visiting.add(id)
      const deps = graph.get(id) ?? []
      for (const d of deps) {
        if (dfs(d)) return true
      }
      visiting.delete(id)
      visited.add(id)
      return false
    }

    for (const t of tasks) {
      if (dfs(t.id)) return true
    }

    return false
  }, [data.taskBreakdown])

  const suggestions: string[] = []
  if (hasMissingSetup) suggestions.push("No obvious setup/scaffolding task detected")
  if (hasMissingTesting) suggestions.push("No obvious testing-related task detected")
  if (hasDependencyIssues) suggestions.push("Dependency graph has invalid references or cycles")

  const allChecked = Object.values(checklist).every(Boolean)

  const toggle = (key: keyof FeatureBuilderData["qaValidation"]["checklist"]) => {
    onChange({
      qaValidation: {
        ...data.qaValidation,
        checklist: {
          ...data.qaValidation.checklist,
          [key]: !data.qaValidation.checklist[key],
        },
      },
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">QA & Validation</h3>
        <p className="text-sm text-muted-foreground">
          Validate the generated task plan before it can be created. This is a quality gate.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Plan snapshot</p>
            <p className="text-xs text-muted-foreground">
              {data.requirements.length} requirements • {data.acceptanceCriteria.length} acceptance criteria
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{totalTasks} tasks</Badge>
            {suggestions.length === 0 ? (
              <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/10">No obvious gaps</Badge>
            ) : (
              <Badge className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/10">{suggestions.length} flags</Badge>
            )}
          </div>
        </div>

        {suggestions.length > 0 && (
          <div className="mt-3 space-y-1">
            {suggestions.map((s) => (
              <div key={s} className="flex items-start gap-2 text-sm text-amber-700">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{s}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">QA Checklist</Label>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Checkbox id="qa-completeness" checked={checklist.completeness} onCheckedChange={() => toggle("completeness")} />
            <label htmlFor="qa-completeness" className="text-sm leading-tight cursor-pointer select-none">
              Tasks cover the full scope (no missing major work)
            </label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="qa-clarity" checked={checklist.clarity} onCheckedChange={() => toggle("clarity")} />
            <label htmlFor="qa-clarity" className="text-sm leading-tight cursor-pointer select-none">
              Each task is clear, actionable, and has enough context
            </label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="qa-req" checked={checklist.requirementsCoverage} onCheckedChange={() => toggle("requirementsCoverage")} />
            <label htmlFor="qa-req" className="text-sm leading-tight cursor-pointer select-none">
              Requirements + acceptance criteria are covered by tasks
            </label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="qa-deps" checked={checklist.dependencies} onCheckedChange={() => toggle("dependencies")} />
            <label htmlFor="qa-deps" className="text-sm leading-tight cursor-pointer select-none">
              Dependencies are correct (no cycles, no missing links)
            </label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="qa-missing" checked={checklist.missingPieces} onCheckedChange={() => toggle("missingPieces")} />
            <label htmlFor="qa-missing" className="text-sm leading-tight cursor-pointer select-none">
              Setup/testing/deployment considerations are addressed
            </label>
          </div>
        </div>

        {allChecked && (
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/20 p-3 rounded-lg mt-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>QA gate passed. You can proceed to create tasks.</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="qa-notes">QA Notes</Label>
        <Textarea
          id="qa-notes"
          value={data.qaValidation.notes}
          onChange={(e) => onChange({ qaValidation: { ...data.qaValidation, notes: e.target.value } })}
          placeholder="Optional notes about gaps, required edits, or context to include when tasks are created..."
          rows={4}
        />
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex items-start gap-2">
          <Check className="h-4 w-4 mt-0.5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            If QA fails, go back to Breakdown to edit/regenerate tasks. This step does not auto-edit tasks.
          </p>
        </div>
      </div>
    </div>
  )
}
