"use client"

import { useMemo } from "react"
import { AlertCircle, CheckCircle, Lightbulb } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { RequirementsTable } from "../requirements-table"
import {
  type Requirement,
  type FeatureBuilderData,
  hasV1Requirements,
  CATEGORY_CONFIG,
  REQUIREMENT_TEMPLATES,
} from "../feature-builder-types"
import { FeatureBuilderStepHeader } from "../feature-builder-help"

interface RequirementsStepProps {
  data: Pick<FeatureBuilderData, "requirements" | "acceptanceCriteria">
  featureName: string
  projectId: string
  onChange: (data: Partial<Pick<FeatureBuilderData, "requirements" | "acceptanceCriteria">>) => void
  errors?: Record<string, string>
}

export function RequirementsStep({
  data,
  featureName,
  projectId,
  onChange,
  errors,
}: RequirementsStepProps) {
  const hasV1 = useMemo(
    () => hasV1Requirements(data.requirements || []),
    [data.requirements]
  )

  const stats = useMemo(() => {
    const reqs = data.requirements || []
    return {
      total: reqs.length,
      v1: reqs.filter((r) => r.category === "v1").length,
      v2: reqs.filter((r) => r.category === "v2").length,
      outOfScope: reqs.filter((r) => r.category === "out-of-scope").length,
    }
  }, [data.requirements])

  const handleRequirementsChange = (requirements: Requirement[]) => {
    onChange({ requirements })
  }

  return (
    <div className="space-y-6">
      <FeatureBuilderStepHeader stepId="requirements" />

      {/* Validation Alert */}
      {!hasV1 && stats.total > 0 && (
        <Alert variant="destructive" className="text-sm">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No V1 Requirements</AlertTitle>
          <AlertDescription>
            At least one V1 (Must Have) requirement is required. V1 requirements
            are critical for MVP and cannot be deferred.
          </AlertDescription>
        </Alert>
      )}

      {hasV1 && (
        <Alert className="text-sm border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">Ready to proceed</AlertTitle>
          <AlertDescription className="text-green-700">
            You have {stats.v1} V1 requirement{stats.v1 !== 1 ? "s" : ""}{" "}
            defined. This feature can move forward to design and implementation.
          </AlertDescription>
        </Alert>
      )}

      {/* Category Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={CATEGORY_CONFIG.v1.color}>
            V1
          </Badge>
          <span className="text-muted-foreground">
            {CATEGORY_CONFIG.v1.description}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={CATEGORY_CONFIG.v2.color}>
            V2
          </Badge>
          <span className="text-muted-foreground">
            {CATEGORY_CONFIG.v2.description}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className={CATEGORY_CONFIG["out-of-scope"].color}
          >
            Out
          </Badge>
          <span className="text-muted-foreground">
            {CATEGORY_CONFIG["out-of-scope"].description}
          </span>
        </div>
      </div>

      {/* Requirements Table */}
      <RequirementsTable
        requirements={data.requirements || []}
        featureName={featureName}
        projectId={projectId}
        onChange={handleRequirementsChange}
        errors={errors}
      />

      {/* Tips */}
      <Alert variant="default" className="text-sm">
        <Lightbulb className="h-4 w-4" />
        <AlertTitle>Writing Good Requirements</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>Use clear, testable language. Good requirements describe:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-2 text-muted-foreground">
            <li>
              Who (the actor) - e.g., &quot;User&quot;, &quot;Admin&quot;,
              &quot;System&quot;
            </li>
            <li>
              What (the action) - e.g., &quot;can create&quot;,
              &quot;validates&quot;, &quot;sends&quot;
            </li>
            <li>Outcome - what happens after the action</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* Templates */}
      <div className="space-y-3 pt-2 border-t">
        <h4 className="text-sm font-medium">Requirement Templates</h4>
        <div className="grid gap-3 text-xs">
          <div className="space-y-1.5">
            <span className="font-medium text-green-700">V1 (Must Have)</span>
            <div className="space-y-1 ml-2 text-muted-foreground">
              {REQUIREMENT_TEMPLATES.v1.slice(0, 2).map((t, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-muted-foreground/60">•</span>
                  <span>{t.description}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="font-medium text-yellow-700">
              V2 (Should Have)
            </span>
            <div className="space-y-1 ml-2 text-muted-foreground">
              {REQUIREMENT_TEMPLATES.v2.slice(0, 2).map((t, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-muted-foreground/60">•</span>
                  <span>{t.description}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legacy Acceptance Criteria */}
      <div className="space-y-2 pt-4 border-t">
        <h4 className="text-sm font-medium">Acceptance Criteria (Optional)</h4>
        <p className="text-xs text-muted-foreground">
          Define specific, testable scenarios that verify the requirements above.
          These become your definition of done.
        </p>
        <textarea
          className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={
            "Given [context], when [action], then [outcome]\nGiven logged out user, when valid credentials submitted, then user is authenticated"
          }
          value={(data.acceptanceCriteria || []).join("\n")}
          onChange={(e) => {
            const items = e.target.value
              .split("\n")
              .filter((line) => line.trim() !== "")
            onChange({ acceptanceCriteria: items })
          }}
        />
      </div>
    </div>
  )
}
