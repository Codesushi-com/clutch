"use client"

import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { FeatureBuilderData } from "../feature-builder-types"
import { FeatureBuilderStepHeader } from "../feature-builder-help"

interface RequirementsStepProps {
  data: Pick<FeatureBuilderData, "requirements" | "acceptanceCriteria">
  onChange: (data: Partial<Pick<FeatureBuilderData, "requirements" | "acceptanceCriteria">>) => void
  errors?: Record<string, string>
}

export function RequirementsStep({ data, onChange, errors }: RequirementsStepProps) {
  const requirementsText = data.requirements.join("\n")
  const criteriaText = data.acceptanceCriteria.join("\n")

  const handleRequirementsChange = (text: string) => {
    const items = text.split("\n").filter(line => line.trim() !== "")
    onChange({ requirements: items })
  }

  const handleCriteriaChange = (text: string) => {
    const items = text.split("\n").filter(line => line.trim() !== "")
    onChange({ acceptanceCriteria: items })
  }

  return (
    <div className="space-y-6">
      <FeatureBuilderStepHeader stepId="requirements" />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="requirements">Functional Requirements</Label>
          <Textarea
            id="requirements"
            value={requirementsText}
            onChange={(e) => handleRequirementsChange(e.target.value)}
            placeholder={"User can log in with email and password\nPassword reset flow via email\nSession management with JWT tokens"}
            rows={5}
            className={errors?.requirements ? "border-destructive" : ""}
          />
          {errors?.requirements && (
            <p className="text-xs text-destructive">{errors.requirements}</p>
          )}
          <p className="text-xs text-muted-foreground">
            List each requirement on a new line.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="criteria">Acceptance Criteria</Label>
          <Textarea
            id="criteria"
            value={criteriaText}
            onChange={(e) => handleCriteriaChange(e.target.value)}
            placeholder={"Given valid credentials, user is authenticated and redirected to dashboard\nGiven invalid password, user sees error message\nPassword reset email is sent within 30 seconds"}
            rows={5}
            className={errors?.acceptanceCriteria ? "border-destructive" : ""}
          />
          {errors?.acceptanceCriteria && (
            <p className="text-xs text-destructive">{errors.acceptanceCriteria}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Define clear, testable criteria for when this feature is complete.
          </p>
        </div>
      </div>
    </div>
  )
}
