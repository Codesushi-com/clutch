"use client"

import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { FeatureBuilderData } from "../feature-builder-types"
import { FeatureBuilderStepHeader } from "../feature-builder-help"

interface DesignStepProps {
  data: Pick<FeatureBuilderData, "designNotes" | "technicalApproach">
  onChange: (data: Partial<Pick<FeatureBuilderData, "designNotes" | "technicalApproach">>) => void
  errors?: Record<string, string>
}

export function DesignStep({ data, onChange, errors }: DesignStepProps) {
  return (
    <div className="space-y-6">
      <FeatureBuilderStepHeader stepId="design" />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="technicalApproach">Technical Approach</Label>
          <Textarea
            id="technicalApproach"
            value={data.technicalApproach}
            onChange={(e) => onChange({ technicalApproach: e.target.value })}
            placeholder="Describe the high-level technical approach..."
            rows={5}
            className={errors?.technicalApproach ? "border-destructive" : ""}
          />
          {errors?.technicalApproach && (
            <p className="text-xs text-destructive">{errors.technicalApproach}</p>
          )}
          <p className="text-xs text-muted-foreground">
            How will this be built? What technologies, patterns, or architectures will be used?
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="designNotes">Design Notes</Label>
          <Textarea
            id="designNotes"
            value={data.designNotes}
            onChange={(e) => onChange({ designNotes: e.target.value })}
            placeholder="Any additional design considerations, diagrams, or references..."
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            UI mockups, API designs, database schema notes, etc.
          </p>
        </div>
      </div>
    </div>
  )
}
