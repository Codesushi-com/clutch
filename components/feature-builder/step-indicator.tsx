"use client"

import { cn } from "@/lib/utils"
import type { FeatureBuilderStep } from "./feature-builder-types"
import { STEPS, getStepConfig } from "./feature-builder-types"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface StepIndicatorProps {
  currentStep: FeatureBuilderStep
  completedSteps: FeatureBuilderStep[]
  onStepClick?: (step: FeatureBuilderStep) => void
  allowNavigation?: boolean
}

function StepSegment({
  step,
  isCompleted,
  isCurrent,
  isClickable,
  onClick,
}: {
  step: { id: FeatureBuilderStep; label: string; index: number }
  isCompleted: boolean
  isCurrent: boolean
  isClickable: boolean
  onClick?: () => void
}) {
  const segment = (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      className={cn(
        "h-2 flex-1 rounded-sm transition-all duration-200",
        isCurrent && [
          "bg-primary",
          "ring-2 ring-primary ring-offset-1 ring-offset-background",
          "animate-pulse",
        ],
        isCompleted && !isCurrent && "bg-primary hover:bg-primary/80",
        !isCurrent && !isCompleted && "bg-muted",
        isClickable && "cursor-pointer",
        !isClickable && "cursor-not-allowed"
      )}
      aria-current={isCurrent ? "step" : undefined}
      aria-label={`Step ${step.index + 1}: ${step.label}`}
    />
  )

  if (isClickable) {
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            {segment}
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {step.label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return segment
}

export function StepIndicator({
  currentStep,
  completedSteps,
  onStepClick,
  allowNavigation = false,
}: StepIndicatorProps) {
  const currentConfig = getStepConfig(currentStep)

  return (
    <div className="w-full">
      {/* Segmented progress bar */}
      <div className="flex gap-1">
        {STEPS.map((step) => (
          <StepSegment
            key={step.id}
            step={step}
            isCompleted={completedSteps.includes(step.id)}
            isCurrent={step.id === currentStep}
            isClickable={allowNavigation && completedSteps.includes(step.id)}
            onClick={() => onStepClick?.(step.id)}
          />
        ))}
      </div>

      {/* Current step label */}
      <div className="mt-3 text-sm font-medium text-primary">
        Step {currentConfig.index + 1} of {STEPS.length} — {currentConfig.label}
      </div>
    </div>
  )
}
