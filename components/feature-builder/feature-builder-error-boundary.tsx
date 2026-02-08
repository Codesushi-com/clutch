"use client"

import React from "react"
import { AlertCircle, RefreshCw, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface FeatureBuilderErrorBoundaryProps {
  children: React.ReactNode
  onReset?: () => void
  onClose?: () => void
}

interface FeatureBuilderErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class FeatureBuilderErrorBoundary extends React.Component<
  FeatureBuilderErrorBoundaryProps,
  FeatureBuilderErrorBoundaryState
> {
  constructor(props: FeatureBuilderErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): FeatureBuilderErrorBoundaryState {
    return { hasError: true, error, errorInfo: null }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[FeatureBuilder] Error caught by boundary:", error, errorInfo)
    
    this.setState({ error, errorInfo })

    // Report to analytics if available
    const win = typeof window !== "undefined" ? window as unknown as Record<string, unknown> : null
    if (win && win.gtag) {
      const gtag = win.gtag as (event: string, action: string, params: Record<string, unknown>) => void
      gtag("event", "feature_builder_error", {
        event_category: "error",
        event_label: error.message,
        value: 1,
      })
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    this.props.onReset?.()
  }

  handleClose = () => {
    this.props.onClose?.()
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-6 w-6" />
              <CardTitle>Something went wrong</CardTitle>
            </div>
            <CardDescription>
              The Feature Builder encountered an unexpected error. Your progress has been saved.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-md text-sm font-mono text-muted-foreground overflow-auto max-h-32">
              {this.state.error?.message || "Unknown error"}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={this.handleReset}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
              
              {this.props.onClose && (
                <Button
                  variant="outline"
                  onClick={this.handleClose}
                  className="flex items-center gap-2"
                >
                  <Home className="h-4 w-4" />
                  Close Feature Builder
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              If this problem persists, please report it with the error message above.
            </p>
          </CardContent>
        </Card>
      )
    }

    return this.props.children
  }
}

// Hook for logging feature builder events
export function useFeatureBuilderAnalytics() {
  const logEvent = React.useCallback((
    eventName: string,
    params?: Record<string, unknown>
  ) => {
    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.log(`[FeatureBuilder Analytics] ${eventName}`, params)
    }

    // Send to Google Analytics if available
    const win = typeof window !== "undefined" ? window as unknown as Record<string, unknown> : null
    if (win && win.gtag) {
      const gtag = win.gtag as (event: string, action: string, params: Record<string, unknown>) => void
      gtag("event", `feature_builder_${eventName}`, {
        event_category: "feature_builder",
        ...params,
      })
    }
  }, [])

  return { logEvent }
}

// Help text constants for the feature builder flow
export const FEATURE_BUILDER_HELP = {
  overview: {
    title: "Feature Overview",
    description: "Start by giving your feature a clear name and description. This helps the AI understand what you're building.",
    tips: [
      "Use a descriptive name that captures the essence of the feature",
      "The description should explain what problem this feature solves",
      "Select the project where this feature will be implemented",
    ],
  },
  research: {
    title: "Research",
    description: "The AI will research best practices, similar implementations, and potential challenges.",
    tips: [
      "Research is optional but highly recommended for complex features",
      "You can skip this step if you already have a clear implementation plan",
      "The research results will inform the later steps",
    ],
  },
  requirements: {
    title: "Requirements",
    description: "Define what the feature must do. Clear requirements are essential for successful implementation.",
    tips: [
      "Start with user-facing requirements (what users can do)",
      "Include technical requirements (performance, security, etc.)",
      "Each requirement should be testable",
    ],
  },
  design: {
    title: "Design",
    description: "Outline the technical approach and design considerations.",
    tips: [
      "Consider the user experience and interface design",
      "Think about data models and API structures",
      "Document any architectural decisions",
    ],
  },
  implementation: {
    title: "Implementation Plan",
    description: "Break down the technical approach into actionable steps.",
    tips: [
      "Estimate effort in hours for planning purposes",
      "Identify dependencies between components",
      "Consider risks and mitigation strategies",
    ],
  },
  breakdown: {
    title: "Task Breakdown",
    description: "Convert your implementation plan into specific tasks that can be assigned to agents.",
    tips: [
      "Tasks should be small enough to complete in a single session",
      "Group related tasks into phases",
      "Set priorities based on dependencies and impact",
    ],
  },
  testing: {
    title: "Testing Strategy",
    description: "Define how you'll verify the feature works correctly.",
    tips: [
      "Include both automated and manual testing approaches",
      "Consider edge cases and error scenarios",
      "Define acceptance criteria for each requirement",
    ],
  },
  review: {
    title: "Review",
    description: "Review all the information before creating the feature ticket.",
    tips: [
      "Verify all requirements are captured",
      "Check that estimates are realistic",
      "Ensure nothing important was missed",
    ],
  },
  launch: {
    title: "Launch",
    description: "Create the feature ticket and associated tasks in your project.",
    tips: [
      "The feature will be created as a task/epic in your project",
      "All generated tasks will be linked to the feature",
      "You can track progress on the project board",
    ],
  },
} as const

export type FeatureBuilderStepId = keyof typeof FEATURE_BUILDER_HELP
