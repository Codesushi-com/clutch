"use client"

import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { FeatureBuilderData } from "../feature-builder-types"
import { FeatureBuilderStepHeader } from "../feature-builder-help"

interface ImplementationStepProps {
  data: Pick<FeatureBuilderData, "implementationPlan" | "estimatedHours">
  onChange: (data: Partial<Pick<FeatureBuilderData, "implementationPlan" | "estimatedHours">>) => void
  errors?: Record<string, string>
}

export function ImplementationStep({ data, onChange, errors }: ImplementationStepProps) {
  return (
    <div className="space-y-6">
      <FeatureBuilderStepHeader stepId="implementation" />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="estimatedHours">Estimated Hours</Label>
          <Input
            id="estimatedHours"
            type="number"
            min={0}
            step={0.5}
            value={data.estimatedHours || ""}
            onChange={(e) => onChange({ estimatedHours: parseFloat(e.target.value) || 0 })}
            placeholder="e.g., 16"
            className={errors?.estimatedHours ? "border-destructive w-32" : "w-32"}
          />
          {errors?.estimatedHours && (
            <p className="text-xs text-destructive">{errors.estimatedHours}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="implementationPlan">Implementation Plan</Label>
          <Textarea
            id="implementationPlan"
            value={data.implementationPlan}
            onChange={(e) => onChange({ implementationPlan: e.target.value })}
            placeholder={"1. Set up authentication middleware\n2. Create login/signup forms\n3. Implement password reset flow\n4. Add session management\n5. Write tests"}
            rows={8}
            className={errors?.implementationPlan ? "border-destructive" : ""}
          />
          {errors?.implementationPlan && (
            <p className="text-xs text-destructive">{errors.implementationPlan}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Break down the work into specific, actionable tasks.
          </p>
        </div>
      </div>
    </div>
  )
}
