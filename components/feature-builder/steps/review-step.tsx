"use client"

import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { FeatureBuilderData } from "../feature-builder-types"
import { FeatureBuilderStepHeader } from "../feature-builder-help"

interface ReviewStepProps {
  data: Pick<FeatureBuilderData, "reviewNotes">
  fullData: FeatureBuilderData
  onChange: (data: Partial<Pick<FeatureBuilderData, "reviewNotes">>) => void
}

export function ReviewStep({ data, fullData, onChange }: ReviewStepProps) {
  return (
    <div className="space-y-6">
      <FeatureBuilderStepHeader stepId="review" />

      {/* Summary preview */}
      <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase">Feature Name</span>
          <p className="font-medium">{fullData.name || "Not specified"}</p>
        </div>
        
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase">Description</span>
          <p className="text-sm text-muted-foreground line-clamp-3">
            {fullData.description || "Not specified"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase">Requirements</span>
            <p className="text-sm">{fullData.requirements.length} items</p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase">Test Cases</span>
            <p className="text-sm">{fullData.testCases.length} items</p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase">Estimated Hours</span>
            <p className="text-sm">{fullData.estimatedHours || "Not specified"}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase">Has Design</span>
            <p className="text-sm">{fullData.technicalApproach ? "Yes" : "No"}</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reviewNotes">Review Notes</Label>
        <Textarea
          id="reviewNotes"
          value={data.reviewNotes}
          onChange={(e) => onChange({ reviewNotes: e.target.value })}
          placeholder="Any final notes, concerns, or considerations before proceeding..."
          rows={4}
        />
      </div>
    </div>
  )
}
