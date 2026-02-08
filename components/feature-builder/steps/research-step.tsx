"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { 
  ChevronDown, 
  ChevronUp, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Lightbulb, 
  Boxes, 
  AlertTriangle,
  Sparkles,
  ArrowRight
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { 
  FeatureBuilderData, 
  ResearchProgress, 
  ResearchThread,
  ResearchThreadStatus 
} from "../feature-builder-types"
import { FeatureBuilderStepHeader } from "../feature-builder-help"

interface ResearchStepProps {
  data: Pick<FeatureBuilderData, "name" | "description" | "research">
  onChange: (data: Partial<Pick<FeatureBuilderData, "research">>) => void
  errors?: Record<string, string>
}

// Default research threads configuration
const DEFAULT_THREADS: Omit<ResearchThread, "id">[] = [
  {
    name: "Stack",
    description: "Technology stack and dependencies",
    status: "pending",
    progress: 0,
    result: null,
    error: null,
    startedAt: null,
    completedAt: null,
  },
  {
    name: "Features",
    description: "Similar features and implementations",
    status: "pending",
    progress: 0,
    result: null,
    error: null,
    startedAt: null,
    completedAt: null,
  },
  {
    name: "Architecture",
    description: "System design patterns",
    status: "pending",
    progress: 0,
    result: null,
    error: null,
    startedAt: null,
    completedAt: null,
  },
  {
    name: "Pitfalls",
    description: "Common mistakes and edge cases",
    status: "pending",
    progress: 0,
    result: null,
    error: null,
    startedAt: null,
    completedAt: null,
  },
]

// Thread icon mapping
const THREAD_ICONS: Record<string, React.ReactNode> = {
  Stack: <Layers className="h-5 w-5" />,
  Features: <Lightbulb className="h-5 w-5" />,
  Architecture: <Boxes className="h-5 w-5" />,
  Pitfalls: <AlertTriangle className="h-5 w-5" />,
}

// Status badge component
function StatusBadge({ status }: { status: ResearchThreadStatus }) {
  const variants: Record<ResearchThreadStatus, { variant: "default" | "secondary" | "destructive" | "outline" | "success"; icon: React.ReactNode; label: string }> = {
    pending: { variant: "outline", icon: null, label: "Pending" },
    running: { variant: "default", icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Running" },
    completed: { variant: "success", icon: <CheckCircle2 className="h-3 w-3" />, label: "Complete" },
    failed: { variant: "destructive", icon: <AlertCircle className="h-3 w-3" />, label: "Failed" },
  }
  
  const config = variants[status]
  
  return (
    <Badge variant={config.variant} className="flex items-center gap-1">
      {config.icon}
      {config.label}
    </Badge>
  )
}

// Individual research card component
function ResearchCard({ 
  thread, 
  isExpanded, 
  onToggle 
}: { 
  thread: ResearchThread
  isExpanded: boolean
  onToggle: () => void 
}) {
  const isComplete = thread.status === "completed"
  const isFailed = thread.status === "failed"
  const isRunning = thread.status === "running"
  
  return (
    <Card className={cn(
      "transition-all duration-300",
      isRunning && "border-primary/50 shadow-sm",
      isComplete && "border-green-500/30",
      isFailed && "border-destructive/50"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg transition-colors",
              isRunning && "bg-primary/10 text-primary",
              isComplete && "bg-green-500/10 text-green-600",
              isFailed && "bg-destructive/10 text-destructive",
              thread.status === "pending" && "bg-muted text-muted-foreground"
            )}>
              {THREAD_ICONS[thread.name] || <Sparkles className="h-5 w-5" />}
            </div>
            <div>
              <CardTitle className="text-base">{thread.name}</CardTitle>
              <p className="text-xs text-muted-foreground">{thread.description}</p>
            </div>
          </div>
          <StatusBadge status={thread.status} />
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{thread.progress}%</span>
          </div>
          <Progress 
            value={thread.progress} 
            className={cn(
              "h-2 transition-all",
              isRunning && "animate-pulse"
            )}
          />
        </div>
        
        {/* Error message */}
        {isFailed && thread.error && (
          <div className="mt-3 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {thread.error}
            </p>
          </div>
        )}
        
        {/* Expandable result preview */}
        {thread.result && (
          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="h-7 px-2 text-xs w-full justify-between"
            >
              <span>Preview results</span>
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            
            {isExpanded && (
              <div className="mt-2 p-3 bg-muted/50 rounded-md border text-sm max-h-48 overflow-y-auto">
                <div className="prose prose-sm max-w-none">
                  {thread.result.split('\n').map((line, i) => (
                    <p key={i} className="mb-1 last:mb-0">{line}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Simulate research progress (for demo/development)
function simulateResearchProgress(
  research: ResearchProgress, 
  onUpdate: (progress: ResearchProgress) => void
): () => void {
  let intervalId: NodeJS.Timeout | null = null
  
  const updateThread = (threads: ResearchThread[]): ResearchThread[] => {
    return threads.map(thread => {
      if (thread.status === "completed" || thread.status === "failed") {
        return thread
      }

      if (thread.status === "pending") {
        // Randomly start threads
        if (Math.random() > 0.7) {
          return { ...thread, status: "running", startedAt: Date.now() }
        }
        return thread
      }

      if (thread.status === "running") {
        // Increment progress
        const increment = Math.floor(Math.random() * 15) + 5
        const newProgress = Math.min(thread.progress + increment, 100)

        if (newProgress >= 100) {
          // Complete with sample result
          return {
            ...thread,
            status: "completed",
            progress: 100,
            completedAt: Date.now(),
            result: generateSampleResult(thread.name)
          }
        }

        return { ...thread, progress: newProgress }
      }

      return thread
    })
  }
  
  intervalId = setInterval(() => {
    const updatedThreads = updateThread(research.threads)
    const completedCount = updatedThreads.filter(t => t.status === "completed").length
    const failedCount = updatedThreads.filter(t => t.status === "failed").length
    const overallProgress = Math.floor(
      updatedThreads.reduce((sum, t) => sum + t.progress, 0) / updatedThreads.length
    )
    
    onUpdate({
      threads: updatedThreads,
      overallProgress,
      isComplete: completedCount === updatedThreads.length,
      hasErrors: failedCount > 0,
    })
  }, 800)
  
  return () => {
    if (intervalId) clearInterval(intervalId)
  }
}

// Generate sample results for demo
function generateSampleResult(threadName: string): string {
  const samples: Record<string, string> = {
    Stack: "Recommended tech stack:\n- Next.js 14 with App Router\n- TypeScript for type safety\n- Tailwind CSS for styling\n- Convex for backend/state\n- Lucide React for icons",
    Features: "Similar implementations found:\n- shadcn/ui has comprehensive component library\n- Radix UI primitives provide accessibility\n- Consider adding animations with Framer Motion\n- Dark mode support via next-themes",
    Architecture: "Recommended architecture:\n- Use React Server Components where possible\n- Client components for interactivity\n- Custom hooks for reusable logic\n- Context providers for global state",
    Pitfalls: "Common pitfalls to avoid:\n- Don't over-fetch data in loops\n- Watch for hydration mismatches\n- Handle loading states gracefully\n- Test with slow connections",
  }
  return samples[threadName] || "Research completed successfully."
}

// Initialize research with default threads
function initializeResearch(): ResearchProgress {
  return {
    threads: DEFAULT_THREADS.map((t, i) => ({ ...t, id: `thread-${i}` })),
    overallProgress: 0,
    isComplete: false,
    hasErrors: false,
  }
}

export function ResearchStep({ data, onChange, errors }: ResearchStepProps) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [isSimulating, setIsSimulating] = useState(false)
  const hasInitialized = useRef(false)
  
  const research = data.research
  
  // Start research if not started
  const handleStartResearch = useCallback(() => {
    const newResearch = initializeResearch()
    onChange({ research: newResearch })
    setIsSimulating(true)
  }, [onChange])
  
  // Toggle card expansion
  const toggleCard = useCallback((threadId: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(threadId)) {
        next.delete(threadId)
      } else {
        next.add(threadId)
      }
      return next
    })
  }, [])
  
  // Simulate progress effect
  useEffect(() => {
    if (!isSimulating || !research) return
    
    const cleanup = simulateResearchProgress(research, (updated) => {
      onChange({ research: updated })
      if (updated.isComplete) {
        setIsSimulating(false)
      }
    })
    
    return cleanup
  }, [isSimulating, research, onChange])
  
  // Auto-start research on mount if not started - use ref to prevent cascading renders
  useEffect(() => {
    if (!research && !hasInitialized.current) {
      hasInitialized.current = true
      // Use timeout to break synchronous execution
      const timeoutId = setTimeout(() => {
        handleStartResearch()
      }, 0)
      return () => clearTimeout(timeoutId)
    }
  }, [research, handleStartResearch])
  
  if (!research) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Initializing research agents...</p>
      </div>
    )
  }
  
  const completedCount = research.threads.filter(t => t.status === "completed").length
  const runningCount = research.threads.filter(t => t.status === "running").length
  
  return (
    <div className="space-y-6">
      <FeatureBuilderStepHeader stepId="research" />
      
      {/* Overall progress */}
      <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium">Overall Progress</span>
          </div>
          <div className="flex items-center gap-2">
            {research.isComplete ? (
              <Badge variant="success" className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Complete
              </Badge>
            ) : (
              <Badge variant="outline">
                {completedCount}/{research.threads.length} complete
              </Badge>
            )}
            {runningCount > 0 && (
              <Badge variant="default" className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {runningCount} running
              </Badge>
            )}
          </div>
        </div>
        <Progress value={research.overallProgress} className="h-3" />
        <p className="text-xs text-muted-foreground">
          {research.isComplete 
            ? "All research threads completed. Review the results below."
            : `Researching ${data.name || "feature"}... Agents are analyzing technology stack, similar features, architecture patterns, and potential pitfalls.`
          }
        </p>
      </div>
      
      {/* Research cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {research.threads.map(thread => (
          <ResearchCard
            key={thread.id}
            thread={thread}
            isExpanded={expandedCards.has(thread.id)}
            onToggle={() => toggleCard(thread.id)}
          />
        ))}
      </div>
      
      {/* Error summary */}
      {research.hasErrors && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="font-medium">Some research threads failed</span>
          </div>
          <p className="text-sm text-destructive/80 mt-1">
            You can continue with partial results or retry failed threads.
          </p>
        </div>
      )}
      
      {/* Continue button */}
      {research.isComplete && (
        <div className="flex items-center justify-center pt-4">
          <Button 
            onClick={() => {}}
            className="flex items-center gap-2"
            size="lg"
          >
            Continue to Requirements
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      
      {errors?.research && (
        <p className="text-xs text-destructive">{errors.research}</p>
      )}
    </div>
  )
}
