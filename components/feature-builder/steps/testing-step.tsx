"use client"

import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { FeatureBuilderData } from "../feature-builder-types"
import { FeatureBuilderStepHeader } from "../feature-builder-help"

interface TestingStepProps {
  data: Pick<FeatureBuilderData, "testStrategy" | "testCases">
  onChange: (data: Partial<Pick<FeatureBuilderData, "testStrategy" | "testCases">>) => void
  errors?: Record<string, string>
}

export function TestingStep({ data, onChange, errors }: TestingStepProps) {
  const testCasesText = data.testCases.join("\n")

  const handleTestCasesChange = (text: string) => {
    const items = text.split("\n").filter(line => line.trim() !== "")
    onChange({ testCases: items })
  }

  return (
    <div className="space-y-6">
      <FeatureBuilderStepHeader stepId="testing" />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="testStrategy">Test Strategy</Label>
          <Textarea
            id="testStrategy"
            value={data.testStrategy}
            onChange={(e) => onChange({ testStrategy: e.target.value })}
            placeholder="Unit tests for business logic, integration tests for API endpoints, E2E tests for critical user flows..."
            rows={4}
            className={errors?.testStrategy ? "border-destructive" : ""}
          />
          {errors?.testStrategy && (
            <p className="text-xs text-destructive">{errors.testStrategy}</p>
          )}
          <p className="text-xs text-muted-foreground">
            What types of tests will be written? What coverage is expected?
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="testCases">Key Test Cases</Label>
          <Textarea
            id="testCases"
            value={testCasesText}
            onChange={(e) => handleTestCasesChange(e.target.value)}
            placeholder={"Valid login credentials authenticate user\nInvalid credentials show error without revealing which field is wrong\nPassword reset token expires after 24 hours"}
            rows={6}
          />
          <p className="text-xs text-muted-foreground">
            List the most important test scenarios, one per line.
          </p>
        </div>
      </div>
    </div>
  )
}
