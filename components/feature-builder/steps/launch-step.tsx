"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Rocket, CheckCircle2 } from "lucide-react"
import type { FeatureBuilderData } from "../feature-builder-types"
import { FeatureBuilderStepHeader } from "../feature-builder-help"

interface LaunchStepProps {
  data: Pick<FeatureBuilderData, "launchChecklist">
  fullData: FeatureBuilderData
  onChange: (data: Partial<Pick<FeatureBuilderData, "launchChecklist">>) => void
  isSubmitting: boolean
}

const DEFAULT_CHECKLIST = [
  "All required fields are completed",
  "Requirements are clear and testable",
  "Technical approach has been considered",
  "Implementation plan is realistic",
  "Testing strategy is defined",
]

export function LaunchStep({ data, fullData, onChange, isSubmitting }: LaunchStepProps) {
  const checklist = data.launchChecklist.length > 0 ? data.launchChecklist : DEFAULT_CHECKLIST
  const allChecked = checklist.length > 0 && checklist.every(item => 
    data.launchChecklist.includes(item)
  )

  const toggleItem = (item: string) => {
    const current = data.launchChecklist
    const updated = current.includes(item)
      ? current.filter(i => i !== item)
      : [...current, item]
    onChange({ launchChecklist: updated })
  }

  return (
    <div className="space-y-6">
      <FeatureBuilderStepHeader stepId="launch" />

      {/* Feature summary card */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <Rocket className="w-5 h-5 text-primary mt-0.5" />
          <div>
            <h4 className="font-medium">{fullData.name || "Untitled Feature"}</h4>
            <p className="text-sm text-muted-foreground mt-1">
              {fullData.description || "No description provided"}
            </p>
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Pre-flight Checklist</Label>
        <div className="space-y-3">
          {checklist.map((item) => {
            const isChecked = data.launchChecklist.includes(item)
            return (
              <div key={item} className="flex items-start gap-3">
                <Checkbox
                  id={`check-${item}`}
                  checked={isChecked}
                  onCheckedChange={() => toggleItem(item)}
                  disabled={isSubmitting}
                />
                <label
                  htmlFor={`check-${item}`}
                  className={`text-sm leading-tight cursor-pointer select-none ${
                    isChecked ? "text-muted-foreground line-through" : ""
                  }`}
                >
                  {item}
                </label>
              </div>
            )
          })}
        </div>
      </div>

      {/* Ready state */}
      {allChecked && (
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/20 p-3 rounded-lg">
          <CheckCircle2 className="w-4 h-4" />
          <span>Ready to launch! Click Create Feature to proceed.</span>
        </div>
      )}
    </div>
  )
}
