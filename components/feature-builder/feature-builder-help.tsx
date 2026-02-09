"use client"

import { HelpCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { FEATURE_BUILDER_HELP, type FeatureBuilderStepId } from "./feature-builder-error-boundary"

interface FeatureBuilderHelpTooltipProps {
  stepId: FeatureBuilderStepId
  showFullHelp?: boolean
}

export function FeatureBuilderHelpTooltip({ stepId, showFullHelp = false }: FeatureBuilderHelpTooltipProps) {
  const help = FEATURE_BUILDER_HELP[stepId]

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label={`Help for ${help.title}`}
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="start"
          className="max-w-xs"
          sideOffset={8}
        >
          <div className="space-y-2">
            <p className="font-medium">{help.title}</p>
            <p className="text-sm text-muted-foreground">{help.description}</p>
            {showFullHelp && help.tips.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-1 mt-2">
                {help.tips.map((tip, index) => (
                  <li key={index} className="flex items-start gap-1.5">
                    <span className="text-primary">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface FeatureBuilderStepHeaderProps {
  stepId: FeatureBuilderStepId
  showHelp?: boolean
}

export function FeatureBuilderStepHeader({ stepId, showHelp = true }: FeatureBuilderStepHeaderProps) {
  const help = FEATURE_BUILDER_HELP[stepId]

  return (
    <div className="flex items-start gap-2 mb-4">
      <div className="flex-1">
        <h3 className="text-lg font-semibold">{help.title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{help.description}</p>
      </div>
      {showHelp && (
        <FeatureBuilderHelpTooltip stepId={stepId} showFullHelp />
      )}
    </div>
  )
}
