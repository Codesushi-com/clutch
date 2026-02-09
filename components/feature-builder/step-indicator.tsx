"use client"

import { cn } from "@/lib/utils"
import { Check } from "lucide-react"
import type { FeatureBuilderStep, StepConfig } from "./feature-builder-types"
import { STEPS } from "./feature-builder-types"

interface StepIndicatorProps {
  currentStep: FeatureBuilderStep
  completedSteps: FeatureBuilderStep[]
  onStepClick?: (step: FeatureBuilderStep) => void
  allowNavigation?: boolean
}

function StepDot({
  step,
  currentStep,
  isCompleted,
  isClickable,
  onClick,
}: {
  step: StepConfig
  currentStep: FeatureBuilderStep
  isCompleted: boolean
  isClickable: boolean
  onClick?: () => void
}) {
  const isCurrent = step.id === currentStep
  
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      className={cn(
        "relative flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-offset-2",
        isCurrent && [
          "bg-primary text-primary-foreground",
          "ring-2 ring-primary ring-offset-2 ring-offset-background",
          "scale-110",
        ],
        isCompleted && !isCurrent && [
          "bg-primary/20 text-primary",
          "hover:bg-primary/30",
        ],
        !isCurrent && !isCompleted && [
          "bg-muted text-muted-foreground",
          "border-2 border-muted-foreground/20",
        ],
        isClickable && "cursor-pointer hover:scale-105",
        !isClickable && "cursor-not-allowed opacity-60"
      )}
      aria-current={isCurrent ? "step" : undefined}
      aria-label={`Step ${step.index + 1}: ${step.label}`}
    >
      {isCompleted && !isCurrent ? (
        <Check className="w-4 h-4" />
      ) : (
        step.index + 1
      )}
    </button>
  )
}

function StepConnector({ isCompleted }: { isCompleted: boolean }) {
  return (
    <div className="flex-1 h-0.5 mx-2 relative">
      <div className="absolute inset-0 bg-muted-foreground/20 rounded-full" />
      <div
        className={cn(
          "absolute inset-0 bg-primary rounded-full transition-all duration-500",
          isCompleted ? "w-full" : "w-0"
        )}
      />
    </div>
  )
}

export function StepIndicator({
  currentStep,
  completedSteps,
  onStepClick,
  allowNavigation = false,
}: StepIndicatorProps) {
  return (
    <div className="w-full">
      {/* Step dots and labels - unified layout */}
      <div className="overflow-x-auto">
        <div className="flex items-start justify-between min-w-[760px] pr-2">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex flex-1 items-center">
              {/* Step container with dot and label */}
              <div className="flex flex-col items-center flex-1">
                <StepDot
                  step={step}
                  currentStep={currentStep}
                  isCompleted={completedSteps.includes(step.id)}
                  isClickable={allowNavigation && completedSteps.includes(step.id)}
                  onClick={() => onStepClick?.(step.id)}
                />
                {/* Label directly below dot */}
                <div
                  className={cn(
                    "mt-2 text-xs text-center whitespace-nowrap",
                    step.id === currentStep && "text-primary font-medium",
                    step.id !== currentStep && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </div>
              </div>
              {/* Connector between steps */}
              {index < STEPS.length - 1 && (
                <StepConnector isCompleted={completedSteps.includes(step.id)} />
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Current step description - mobile */}
      <div className="md:hidden mt-3 text-center">
        <div className="text-sm font-medium text-primary">
          {STEPS.find(s => s.id === currentStep)?.label}
        </div>
        <div className="text-xs text-muted-foreground">
          {STEPS.find(s => s.id === currentStep)?.description}
        </div>
      </div>
    </div>
  )
}
