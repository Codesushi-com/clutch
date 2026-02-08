"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { FeatureBuilderData } from "../feature-builder-types"
import { FeatureBuilderStepHeader } from "../feature-builder-help"

interface OverviewStepProps {
  data: Pick<FeatureBuilderData, "name" | "description" | "projectId">
  projects: { id: string; name: string }[]
  onChange: (data: Partial<Pick<FeatureBuilderData, "name" | "description" | "projectId">>) => void
  errors?: Record<string, string>
}

export function OverviewStep({ data, projects, onChange, errors }: OverviewStepProps) {
  return (
    <div className="space-y-6">
      <FeatureBuilderStepHeader stepId="overview" />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="project">Project</Label>
          <Select
            value={data.projectId}
            onValueChange={(value) => onChange({ projectId: value })}
          >
            <SelectTrigger id="project" className={errors?.projectId ? "border-destructive" : ""}>
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors?.projectId && (
            <p className="text-xs text-destructive">{errors.projectId}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Feature Name</Label>
          <Input
            id="name"
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g., User Authentication System"
            className={errors?.name ? "border-destructive" : ""}
          />
          {errors?.name ? (
            <p className="text-xs text-destructive">{errors.name}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              A concise, descriptive name for the feature.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={data.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Describe what this feature does and why it matters..."
            rows={4}
            className={errors?.description ? "border-destructive" : ""}
          />
          {errors?.description ? (
            <p className="text-xs text-destructive">{errors.description}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              A clear explanation of the feature&apos;s purpose and value.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
