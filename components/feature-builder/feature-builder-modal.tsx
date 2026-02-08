"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, X, Sparkles, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

import {
  type FeatureBuilderStep,
  type FeatureBuilderData,
  STEPS,
  getStepConfig,
  isFirstStep,
  isLastStep,
  getNextStep,
  getPreviousStep,
  hasV1Requirements,
} from "./feature-builder-types"
import { StepIndicator } from "./step-indicator"
import {
  OverviewStep,
  ResearchStep,
  RequirementsStep,
  DesignStep,
  ImplementationStep,
  TaskBreakdownStep,
  TestingStep,
  ReviewStep,
  LaunchStep,
} from "./steps"
import { FeatureBuilderErrorBoundary, useFeatureBuilderAnalytics } from "./feature-builder-error-boundary"

interface FeatureBuilderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultProjectId?: string
}

const INITIAL_DATA: FeatureBuilderData = {
  name: "",
  description: "",
  projectId: "",
  research: null,
  requirements: [],
  acceptanceCriteria: [],
  designNotes: "",
  technicalApproach: "",
  implementationPlan: "",
  estimatedHours: 0,
  taskBreakdown: null,
  qaValidation: {
    checklist: {
      completeness: false,
      clarity: false,
      requirementsCoverage: false,
      dependencies: false,
      missingPieces: false,
    },
    notes: "",
  },
  testStrategy: "",
  testCases: [],
  reviewNotes: "",
  launchChecklist: [],
}

export function FeatureBuilderModal({
  open,
  onOpenChange,
  defaultProjectId,
}: FeatureBuilderModalProps) {
  const [currentStep, setCurrentStep] = useState<FeatureBuilderStep>("overview")
  const [completedSteps, setCompletedSteps] = useState<FeatureBuilderStep[]>([])
  const [data, setData] = useState<FeatureBuilderData>({
    ...INITIAL_DATA,
    projectId: defaultProjectId || "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [hasError, setHasError] = useState(false)

  const isInitialized = useRef(false)
  const stepStartTime = useRef<number>(Date.now())

  const projects = useQuery(api.projects.getAll, {})
  const { logEvent } = useFeatureBuilderAnalytics()

  useEffect(() => {
    if (open && !isInitialized.current && defaultProjectId) {
      isInitialized.current = true

      fetch("/api/feature-builder/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: defaultProjectId }),
      })
        .then(res => res.json())
        .then((result) => {
          if (result.sessionId) {
            setSessionId(result.sessionId)
            logEvent("session_started", { project_id: defaultProjectId, session_id: result.sessionId })
          }
        })
        .catch((err) => {
          console.error("[FeatureBuilder] Failed to create session:", err)
        })
    }
  }, [open, defaultProjectId, logEvent])

  useEffect(() => {
    if (open && sessionId) {
      const now = Date.now()
      const duration = now - stepStartTime.current

      logEvent("step_viewed", {
        session_id: sessionId,
        step: currentStep,
        duration_ms: duration,
      })

      stepStartTime.current = now
    }
  }, [currentStep, open, sessionId, logEvent])

  const resetState = useCallback(() => {
    setCurrentStep("overview")
    setCompletedSteps([])
    setData({ ...INITIAL_DATA, projectId: defaultProjectId || "" })
    setErrors({})
    setHasChanges(false)
    setSessionId(null)
    setHasError(false)
    isInitialized.current = false
    stepStartTime.current = Date.now()
  }, [defaultProjectId])

  const updateData = useCallback((updates: Partial<FeatureBuilderData>) => {
    setData((prev) => ({ ...prev, ...updates }))
    setHasChanges(true)
    // Clear errors for updated fields
    setErrors((prev) => {
      const newErrors = { ...prev }
      Object.keys(updates).forEach((key) => {
        delete newErrors[key]
      })
      return newErrors
    })
  }, [])

  const persistProgress = useCallback(async (
    step: FeatureBuilderStep,
    completed: FeatureBuilderStep[],
    currentData: FeatureBuilderData
  ) => {
    if (!sessionId) return

    try {
      await fetch("/api/feature-builder/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: sessionId,
          current_step: step,
          completed_steps: completed,
          feature_data: JSON.stringify(currentData),
        }),
      })
    } catch (err) {
      console.error("[FeatureBuilder] Failed to persist progress:", err)
    }
  }, [sessionId])

  const validateStep = useCallback(
    (step: FeatureBuilderStep): boolean => {
      const newErrors: Record<string, string> = {}

      switch (step) {
        case "overview":
          if (!data.projectId) {
            newErrors.projectId = "Please select a project"
          }
          if (!data.name.trim()) {
            newErrors.name = "Feature name is required"
          } else if (data.name.length < 3) {
            newErrors.name = "Name must be at least 3 characters"
          }
          if (!data.description.trim()) {
            newErrors.description = "Description is required"
          } else if (data.description.length < 10) {
            newErrors.description = "Description must be at least 10 characters"
          }
          break

        case "research":
          // Research is auto-started and optional - user can continue even if incomplete
          break

        case "requirements":
          if (data.requirements.length === 0) {
            newErrors.requirements = "At least one requirement is required"
          } else if (!hasV1Requirements(data.requirements)) {
            newErrors.requirements =
              "At least one V1 (Must Have) requirement is required"
          }
          break

        case "design":
          // Design is optional but recommended
          break

        case "implementation":
          if (!data.implementationPlan.trim()) {
            newErrors.implementationPlan = "Implementation plan is required"
          }
          break

        case "breakdown":
          break

        case "testing":
          // Testing is optional but recommended
          break

        case "review":
          // Review step has no required fields
          break

        case "launch":
          // Launch step validates via checklist
          break
      }

      setErrors(newErrors)
      return Object.keys(newErrors).length === 0
    },
    [data]
  )

  const handleNext = useCallback(async () => {
    if (!validateStep(currentStep)) {
      logEvent("validation_failed", { step: currentStep, errors: Object.keys(errors) })
      return
    }

    const newCompletedSteps = completedSteps.includes(currentStep)
      ? completedSteps
      : [...completedSteps, currentStep]

    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps(newCompletedSteps)
      logEvent("step_completed", { step: currentStep, session_id: sessionId })
    }

    const nextStep = getNextStep(currentStep)
    if (nextStep) {
      setCurrentStep(nextStep)
      await persistProgress(nextStep, newCompletedSteps, data)
    }
  }, [currentStep, completedSteps, data, errors, logEvent, persistProgress, sessionId, validateStep])

  const handlePrevious = useCallback(() => {
    const prevStep = getPreviousStep(currentStep)
    if (prevStep) {
      setCurrentStep(prevStep)
    }
  }, [currentStep])

  const handleStepClick = useCallback(
    async (step: FeatureBuilderStep) => {
      // Only allow navigation to completed steps or the next available step
      const stepConfig = getStepConfig(step)
      const currentConfig = getStepConfig(currentStep)

      if (
        completedSteps.includes(step) ||
        stepConfig.index === currentConfig.index + 1
      ) {
        // Validate current step before allowing navigation
        if (
          stepConfig.index > currentConfig.index &&
          !validateStep(currentStep)
        ) {
          return
        }
        setCurrentStep(step)
        await persistProgress(step, completedSteps, data)
      }
    },
    [currentStep, completedSteps, data, persistProgress, validateStep]
  )

  const handleCancel = useCallback(() => {
    if (hasChanges && !isSubmitting) {
      setShowCancelConfirm(true)
    } else {
      onOpenChange(false)
      // Reset state after close
      setTimeout(() => {
        resetState()
      }, 200)
    }
  }, [hasChanges, isSubmitting, onOpenChange, resetState])

  const handleConfirmCancel = useCallback(() => {
    setShowCancelConfirm(false)
    onOpenChange(false)
    // Reset state after close
    setTimeout(() => {
      resetState()
    }, 200)
  }, [onOpenChange, resetState])

  const handleSubmit = useCallback(async () => {
    if (!validateStep(currentStep)) {
      return
    }

    setIsSubmitting(true)
    logEvent("feature_creation_started", { session_id: sessionId, feature_name: data.name })

    try {
      // TODO: Call API to create feature ticket
      // await createFeatureTicket(data)

      // For now, just simulate success
      await new Promise((resolve) => setTimeout(resolve, 1000))

      logEvent("feature_created", { session_id: sessionId, feature_name: data.name })
      onOpenChange(false)
      // Reset state
      setTimeout(() => {
        resetState()
      }, 200)
    } catch (error) {
      console.error("Failed to create feature:", error)
      setErrors({ submit: "Failed to create feature. Please try again." })
      logEvent("feature_creation_failed", { session_id: sessionId, error: String(error) })
    } finally {
      setIsSubmitting(false)
    }
  }, [currentStep, data.name, logEvent, onOpenChange, resetState, sessionId, validateStep])

  const renderStepContent = () => {
    const projectList =
      projects?.map((p: { id: string; name: string }) => ({
        id: p.id,
        name: p.name,
      })) || []

    switch (currentStep) {
      case "overview":
        return (
          <OverviewStep
            data={data}
            projects={projectList}
            onChange={updateData}
            errors={errors}
          />
        )
      case "research":
        return (
          <ResearchStep
            data={data}
            onChange={updateData}
            errors={errors}
          />
        )
      case "requirements":
        return (
          <RequirementsStep
            data={data}
            featureName={data.name}
            projectId={data.projectId}
            onChange={updateData}
            errors={errors}
          />
        )
      case "design":
        return (
          <DesignStep data={data} onChange={updateData} errors={errors} />
        )
      case "implementation":
        return (
          <ImplementationStep
            data={data}
            onChange={updateData}
            errors={errors}
          />
        )
      case "breakdown":
        return (
          <TaskBreakdownStep
            data={data}
            onChange={updateData}
            errors={errors}
          />
        )
      case "testing":
        return (
          <TestingStep data={data} onChange={updateData} errors={errors} />
        )
      case "review":
        return <ReviewStep data={data} fullData={data} onChange={updateData} />
      case "launch":
        return (
          <LaunchStep
            data={data}
            fullData={data}
            onChange={updateData}
            isSubmitting={isSubmitting}
          />
        )
      default:
        return null
    }
  }

  const stepConfig = getStepConfig(currentStep)

  return (
    <FeatureBuilderErrorBoundary
      onReset={() => setHasError(false)}
    >
      <Dialog open={open} onOpenChange={handleCancel}>
        <DialogContent
          className="sm:max-w-3xl max-h-[90vh] p-0 gap-0 overflow-hidden"
          showCloseButton={false}
        >
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <DialogTitle>Feature Builder</DialogTitle>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCancel}
                disabled={isSubmitting}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
            <DialogDescription className="text-left">
              Step {stepConfig.index + 1} of {STEPS.length}: {stepConfig.description}
            </DialogDescription>
          </DialogHeader>

          {/* Step Indicator */}
          <div className="px-6 py-4 border-b bg-muted/30">
            <StepIndicator
              currentStep={currentStep}
              completedSteps={completedSteps}
              onStepClick={handleStepClick}
              allowNavigation={true}
            />
          </div>

          {/* Content */}
          <div className="px-6 py-6 overflow-y-auto max-h-[50vh]">
            {hasError && (
              <div className="mb-4 p-4 border border-destructive/50 bg-destructive/10 rounded-lg flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="text-sm font-medium text-destructive">Something went wrong</p>
                  <p className="text-xs text-destructive/80">Please try again or contact support if the problem persists.</p>
                </div>
              </div>
            )}

            {renderStepContent()}

            {errors.submit && (
              <div className="mt-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
                {errors.submit}
              </div>
            )}
          </div>

          {/* Footer Navigation */}
          <div className="px-6 py-4 border-t bg-muted/30 flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={isFirstStep(currentStep) || isSubmitting}
              className={cn(
                "flex items-center gap-1",
                isFirstStep(currentStep) && "invisible"
              )}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>

              {isLastStep(currentStep) ? (
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex items-center gap-1"
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      Creating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Create Feature
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  disabled={isSubmitting}
                  className="flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation */}
      <AlertDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in the Feature Builder. Are you sure you
              want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCancelConfirm(false)}>
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FeatureBuilderErrorBoundary>
  )
}
