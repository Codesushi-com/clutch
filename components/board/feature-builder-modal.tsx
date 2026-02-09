"use client"

import { FeatureBuilderModal as Inner } from "@/components/feature-builder/feature-builder-modal"

export type FeatureBuilderModalProps = {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onTasksCreated?: (count: number) => void
}

// Thin adapter: board page expects `projectId` and optional `onTasksCreated`,
// but the underlying Feature Builder modal uses `defaultProjectId`.
export function FeatureBuilderModal({
  projectId,
  open,
  onOpenChange,
}: FeatureBuilderModalProps) {
  return (
    <Inner
      open={open}
      onOpenChange={onOpenChange}
      defaultProjectId={projectId}
    />
  )
}
