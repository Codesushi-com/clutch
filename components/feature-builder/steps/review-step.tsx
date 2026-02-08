"use client"

import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  type FeatureBuilderData,
  CATEGORY_CONFIG,
  getRequirementsByCategory,
} from "../feature-builder-types"
import { FeatureBuilderStepHeader } from "../feature-builder-help"

interface ReviewStepProps {
  data: Pick<FeatureBuilderData, "reviewNotes">
  fullData: FeatureBuilderData
  onChange: (data: Partial<Pick<FeatureBuilderData, "reviewNotes">>) => void
}

export function ReviewStep({ data, fullData, onChange }: ReviewStepProps) {
  const v1Requirements = getRequirementsByCategory(fullData.requirements, "v1")
  const v2Requirements = getRequirementsByCategory(fullData.requirements, "v2")
  const outOfScope = getRequirementsByCategory(
    fullData.requirements,
    "out-of-scope"
  )

  return (
    <div className="space-y-6">
      <FeatureBuilderStepHeader stepId="review" />

      {/* Summary preview */}
      <div className="rounded-lg border bg-muted/50 p-4 space-y-4">
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase">
            Feature Name
          </span>
          <p className="font-medium">{fullData.name || "Not specified"}</p>
        </div>

        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase">
            Description
          </span>
          <p className="text-sm text-muted-foreground line-clamp-3">
            {fullData.description || "Not specified"}
          </p>
        </div>

        {/* Requirements Summary */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">
              Requirements
            </span>
            <Badge variant="outline" className="text-xs">
              {fullData.requirements.length} total
            </Badge>
          </div>

          {fullData.requirements.length > 0 ? (
            <div className="border rounded-lg overflow-hidden bg-background">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-16 text-xs">ID</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="w-24 text-xs">Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* V1 Requirements */}
                  {v1Requirements.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-mono text-xs py-2">
                        {req.id}
                      </TableCell>
                      <TableCell className="text-sm py-2">
                        {req.description}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge
                          variant="outline"
                          className={CATEGORY_CONFIG.v1.color}
                        >
                          V1
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* V2 Requirements */}
                  {v2Requirements.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-mono text-xs py-2">
                        {req.id}
                      </TableCell>
                      <TableCell className="text-sm py-2">
                        {req.description}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge
                          variant="outline"
                          className={CATEGORY_CONFIG.v2.color}
                        >
                          V2
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Out of Scope */}
                  {outOfScope.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-mono text-xs py-2">
                        {req.id}
                      </TableCell>
                      <TableCell className="text-sm py-2 text-muted-foreground">
                        {req.description}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge
                          variant="outline"
                          className={CATEGORY_CONFIG["out-of-scope"].color}
                        >
                          Out
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No requirements specified
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase">
              Test Cases
            </span>
            <p className="text-sm">
              {fullData.testCases.length > 0
                ? `${fullData.testCases.length} defined`
                : "None defined"}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase">
              Estimated Hours
            </span>
            <p className="text-sm">
              {fullData.estimatedHours > 0
                ? `${fullData.estimatedHours} hours`
                : "Not specified"}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase">
              Has Design
            </span>
            <p className="text-sm">
              {fullData.technicalApproach ? "Yes" : "No"}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase">
              Has Test Strategy
            </span>
            <p className="text-sm">
              {fullData.testStrategy ? "Yes" : "No"}
            </p>
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
