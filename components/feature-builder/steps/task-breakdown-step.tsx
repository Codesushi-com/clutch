"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Loader2,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Link as LinkIcon,
  Layers,
  Sparkles,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  FeatureBuilderData,
  TaskBreakdown,
  TaskPhase,
  GeneratedTask,
  TaskPriority,
  TaskRole,
} from "../feature-builder-types"
import { FeatureBuilderStepHeader } from "../feature-builder-help"

interface TaskBreakdownStepProps {
  data: Pick<FeatureBuilderData, "implementationPlan" | "estimatedHours" | "taskBreakdown" | "projectId" | "qaValidation">
  onChange: (data: Partial<Pick<FeatureBuilderData, "taskBreakdown" | "qaValidation">>) => void
  errors?: Record<string, string>
}

const ROLES: { value: TaskRole; label: string }[] = [
  { value: "dev", label: "Developer" },
  { value: "pm", label: "Product Manager" },
  { value: "research", label: "Researcher" },
  { value: "reviewer", label: "Reviewer" },
]

const PRIORITIES: { value: TaskPriority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "bg-blue-500/10 text-blue-600" },
  { value: "medium", label: "Medium", color: "bg-yellow-500/10 text-yellow-600" },
  { value: "high", label: "High", color: "bg-orange-500/10 text-orange-600" },
  { value: "urgent", label: "Urgent", color: "bg-red-500/10 text-red-600" },
]

// Generate a temporary ID for tasks
const generateTempId = () => `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

// Parse implementation plan into phases
function parseImplementationPlan(plan: string): { name: string; description: string }[] {
  if (!plan.trim()) return []

  const lines = plan.split("\n").map((l) => l.trim()).filter(Boolean)
  const phases: { name: string; description: string }[] = []
  let currentPhase: { name: string; lines: string[] } | null = null

  for (const line of lines) {
    // Check if this is a phase header (numbered or bullet with bold/colon)
    const isPhaseHeader =
      /^\d+[.):]\s*/.test(line) || // 1. or 1) or 1:
      /^[-*]\s+\*\*.+\*\*/.test(line) || // - **Something**
      /^[-*]\s+[^:]*:/.test(line) || // - Something:
      line.toLowerCase().includes("phase") // contains "phase"

    if (isPhaseHeader) {
      // Save previous phase if exists
      if (currentPhase) {
        phases.push({
          name: currentPhase.name,
          description: currentPhase.lines.join(" ").slice(0, 200),
        })
      }
      // Start new phase
      const cleanName = line
        .replace(/^[-*\d.)\s]+/, "") // Remove bullets/numbers
        .replace(/\*\*/g, "") // Remove markdown bold
        .replace(/[:\s]+$/, "") // Remove trailing colons/spaces
        .slice(0, 80) || `Phase ${phases.length + 1}`
      currentPhase = { name: cleanName, lines: [] }
    } else if (currentPhase) {
      currentPhase.lines.push(line)
    } else {
      // First non-header line starts a default phase
      currentPhase = { name: `Phase ${phases.length + 1}`, lines: [line] }
    }
  }

  // Don't forget the last phase
  if (currentPhase) {
    phases.push({
      name: currentPhase.name,
      description: currentPhase.lines.join(" ").slice(0, 200),
    })
  }

  // If no phases detected, treat each non-empty line as a mini-phase
  if (phases.length === 0 && lines.length > 0) {
    return lines.slice(0, 5).map((line, i) => ({
      name: `Task Group ${i + 1}`,
      description: line.slice(0, 200),
    }))
  }

  return phases.slice(0, 8) // Max 8 phases
}

// Generate tasks for a phase using GSD planning logic
function generateTasksForPhase(
  phase: { name: string; description: string },
  phaseIndex: number,
  implementationPlan: string,
  estimatedHours: number
): GeneratedTask[] {
  const tasks: GeneratedTask[] = []
  const hoursPerTask = Math.max(2, Math.ceil((estimatedHours || 16) / 6)) // Distribute hours

  // Task 1: Setup/Research task
  tasks.push({
    id: generateTempId(),
    title: `${phase.name}: Setup and Planning`,
    description: `Set up the foundation for ${phase.name.toLowerCase()}.\n\nContext: ${phase.description}\n\nAcceptance Criteria:\n- [ ] Initial setup complete\n- [ ] Dependencies identified\n- [ ] Basic structure in place`,
    priority: phaseIndex === 0 ? "high" : "medium",
    role: "dev",
    phaseIndex,
    dependsOn: [],
  })

  // Task 2: Main implementation task
  tasks.push({
    id: generateTempId(),
    title: `${phase.name}: Implementation`,
    description: `Implement the core functionality for ${phase.name.toLowerCase()}.\n\nEstimated effort: ${hoursPerTask} hours\n\nThis task covers:\n- Core feature implementation\n- Integration with existing code\n- Basic error handling\n\nContext from plan:\n${phase.description}`,
    priority: "high",
    role: "dev",
    phaseIndex,
    dependsOn: [tasks[0].id], // Depends on setup
  })

  // Task 3: Polish/Integration task (optional for smaller phases)
  if (phaseIndex > 0 || phase.description.length > 50) {
    tasks.push({
      id: generateTempId(),
      title: `${phase.name}: Testing and Polish`,
      description: `Complete testing and polish for ${phase.name.toLowerCase()}.\n\nIncludes:\n- Unit tests\n- Edge case handling\n- Code review preparation\n- Documentation updates`,
      priority: "medium",
      role: "dev",
      phaseIndex,
      dependsOn: [tasks[1].id], // Depends on implementation
    })
  }

  return tasks
}

// Simulate task generation
function simulateTaskGeneration(
  implementationPlan: string,
  estimatedHours: number,
  onUpdate: (breakdown: TaskBreakdown) => void
): () => void {
  let timeoutId: NodeJS.Timeout | null = null

  // Start with generating state
  onUpdate({
    phases: [],
    isGenerating: true,
  })

  // Parse phases
  const parsedPhases = parseImplementationPlan(implementationPlan)

  // Simulate progressive generation
  const generatePhases = async () => {
    const phases: TaskPhase[] = []

    for (let i = 0; i < parsedPhases.length; i++) {
      await new Promise((resolve) => {
        timeoutId = setTimeout(resolve, 300)
      })

      const tasks = generateTasksForPhase(
        parsedPhases[i],
        i,
        implementationPlan,
        estimatedHours
      )

      // Update dependencies between phases
      if (i > 0 && phases[i - 1]) {
        const prevPhaseLastTask = phases[i - 1].tasks[phases[i - 1].tasks.length - 1]
        if (prevPhaseLastTask) {
          tasks[0].dependsOn.push(prevPhaseLastTask.id)
        }
      }

      phases.push({
        index: i,
        name: parsedPhases[i].name,
        description: parsedPhases[i].description,
        tasks,
      })

      onUpdate({
        phases: [...phases],
        isGenerating: i < parsedPhases.length - 1,
      })
    }

    onUpdate({
      phases,
      isGenerating: false,
    })
  }

  generatePhases()

  return () => {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

// Task card component for editing
function TaskCard({
  task,
  allTasks,
  onUpdate,
  onDelete,
}: {
  task: GeneratedTask
  allTasks: GeneratedTask[]
  onUpdate: (task: GeneratedTask) => void
  onDelete: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedTask, setEditedTask] = useState(task)

  const handleSave = () => {
    onUpdate(editedTask)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditedTask(task)
    setIsEditing(false)
  }

  const priorityColor = PRIORITIES.find((p) => p.value === task.priority)?.color || ""

  // Get dependency options (tasks from previous phases or earlier in same phase)
  const dependencyOptions = allTasks.filter(
    (t) => t.phaseIndex < task.phaseIndex || (t.phaseIndex === task.phaseIndex && t.id !== task.id)
  )

  if (isEditing) {
    return (
      <Card className="border-primary/30">
        <CardContent className="p-4 space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Title</Label>
            <Input
              value={editedTask.title}
              onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
              placeholder="Task title"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={editedTask.description}
              onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
              placeholder="Task description"
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Role</Label>
              <Select
                value={editedTask.role}
                onValueChange={(v) => setEditedTask({ ...editedTask, role: v as TaskRole })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Priority</Label>
              <Select
                value={editedTask.priority}
                onValueChange={(v) => setEditedTask({ ...editedTask, priority: v as TaskPriority })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <LinkIcon className="h-3 w-3" />
              Dependencies
            </Label>
            <div className="space-y-1 max-h-24 overflow-y-auto border rounded p-2">
              {dependencyOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No available dependencies</p>
              ) : (
                dependencyOptions.map((opt) => (
                  <label key={opt.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={editedTask.dependsOn.includes(opt.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setEditedTask({
                            ...editedTask,
                            dependsOn: [...editedTask.dependsOn, opt.id],
                          })
                        } else {
                          setEditedTask({
                            ...editedTask,
                            dependsOn: editedTask.dependsOn.filter((id) => id !== opt.id),
                          })
                        }
                      }}
                    />
                    <span className="truncate">{opt.title}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button size="sm" onClick={handleSave} className="flex items-center gap-1">
              <Check className="h-3 w-3" />
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancel}>
              <X className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="destructive" onClick={onDelete} className="ml-auto">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="group hover:border-primary/30 transition-colors">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-sm leading-tight flex-1">{task.title}</h4>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setIsEditing(true)}
          >
            <Edit2 className="h-3 w-3" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">
          {task.description}
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs">
            {ROLES.find((r) => r.value === task.role)?.label}
          </Badge>
          <Badge className={cn("text-xs", priorityColor)}>
            {PRIORITIES.find((p) => p.value === task.priority)?.label}
          </Badge>
          {task.dependsOn.length > 0 && (
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              <LinkIcon className="h-3 w-3" />
              {task.dependsOn.length} deps
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Phase section component
function PhaseSection({
  phase,
  allTasks,
  onUpdatePhase,
}: {
  phase: TaskPhase
  allTasks: GeneratedTask[]
  onUpdatePhase: (phase: TaskPhase) => void
}) {
  const updateTask = (updatedTask: GeneratedTask) => {
    onUpdatePhase({
      ...phase,
      tasks: phase.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
    })
  }

  const deleteTask = (taskId: string) => {
    // Also remove this task from other tasks' dependencies
    const updatedTasks = phase.tasks
      .filter((t) => t.id !== taskId)
      .map((t) => ({
        ...t,
        dependsOn: t.dependsOn.filter((id) => id !== taskId),
      }))
    onUpdatePhase({ ...phase, tasks: updatedTasks })
  }

  const addNewTask = () => {
    const newTask: GeneratedTask = {
      id: generateTempId(),
      title: `${phase.name}: New Task`,
      description: "Task description here...",
      priority: "medium",
      role: "dev",
      phaseIndex: phase.index,
      dependsOn: phase.tasks.length > 0 ? [phase.tasks[phase.tasks.length - 1].id] : [],
    }
    onUpdatePhase({ ...phase, tasks: [...phase.tasks, newTask] })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h3 className="font-medium">{phase.name}</h3>
        <Badge variant="outline" className="text-xs">
          {phase.tasks.length} tasks
        </Badge>
      </div>

      {phase.description && (
        <p className="text-xs text-muted-foreground pl-6">{phase.description}</p>
      )}

      <div className="pl-6 space-y-3">
        {phase.tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            allTasks={allTasks}
            onUpdate={updateTask}
            onDelete={() => deleteTask(task.id)}
          />
        ))}

        <Button variant="outline" size="sm" onClick={addNewTask} className="w-full">
          <Plus className="h-3 w-3 mr-1" />
          Add Task
        </Button>
      </div>
    </div>
  )
}

// Success view component
function SuccessView({
  taskIds,
  projectId,
  onContinue,
}: {
  taskIds: string[]
  projectId: string
  onContinue: () => void
}) {
  const boardUrl = `/projects/${projectId}/board`

  return (
    <div className="space-y-6 py-8">
      <div className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>

        <div>
          <h3 className="text-xl font-semibold">Tasks Created Successfully!</h3>
          <p className="text-muted-foreground mt-1">
            {taskIds.length} tasks have been created and added to your project backlog.
          </p>
        </div>
      </div>

      <div className="bg-muted/30 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Created Tasks:</span>
          <Badge variant="secondary">{taskIds.length}</Badge>
        </div>

        <ScrollArea className="h-32 border rounded bg-background">
          <div className="p-2 space-y-1">
            {taskIds.map((id, i) => (
              <div key={id} className="text-xs font-mono text-muted-foreground">
                {i + 1}. {id.slice(0, 8)}...
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" asChild>
          <a href={boardUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            View in Board
          </a>
        </Button>

        <Button onClick={onContinue} className="flex items-center gap-2">
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function TaskBreakdownStep({ data, onChange, errors }: TaskBreakdownStepProps) {
  const breakdown = data.taskBreakdown
  const hasInitialized = useRef(false)
  const [isCreating, setIsCreating] = useState(false)

  // Initialize task generation
  const handleGenerate = useCallback(() => {
    // Any change to breakdown should reset QA gate.
    onChange({
      qaValidation: {
        ...data.qaValidation,
        checklist: {
          completeness: false,
          clarity: false,
          requirementsCoverage: false,
          dependencies: false,
          missingPieces: false,
        },
      },
    })

    if (!data.implementationPlan.trim()) {
      onChange({
        taskBreakdown: {
          phases: [],
          isGenerating: false,
          error: "No implementation plan to break down. Please go back and add an implementation plan.",
        },
      })
      return
    }

    const cleanup = simulateTaskGeneration(
      data.implementationPlan,
      data.estimatedHours,
      (updated) => {
        onChange({ taskBreakdown: updated })
      }
    )

    return cleanup
  }, [data.implementationPlan, data.estimatedHours, onChange])

  // Auto-generate on mount
  useEffect(() => {
    if (!breakdown && !hasInitialized.current) {
      hasInitialized.current = true
      const timeoutId = setTimeout(() => {
        handleGenerate()
      }, 0)
      return () => clearTimeout(timeoutId)
    }
  }, [breakdown, handleGenerate])

  // Update a specific phase
  const updatePhase = useCallback(
    (updatedPhase: TaskPhase) => {
      if (!breakdown) return
      onChange({
        taskBreakdown: {
          ...breakdown,
          phases: breakdown.phases.map((p) => (p.index === updatedPhase.index ? updatedPhase : p)),
        },
      })
    },
    [breakdown, onChange]
  )

  // Get all tasks across all phases
  const allTasks = breakdown?.phases.flatMap((p) => p.tasks) || []

  // Create tasks via API
  const handleCreateTasks = async () => {
    if (!breakdown || !data.projectId) return

    setIsCreating(true)
    const createdIds: string[] = []
    const tempIdToRealId = new Map<string, string>()

    try {
      // Create tasks phase by phase to maintain order
      for (const phase of breakdown.phases) {
        for (const task of phase.tasks) {
          // Map dependencies to real IDs
          const mappedDependsOn = task.dependsOn
            .map((tempId) => tempIdToRealId.get(tempId))
            .filter(Boolean) as string[]

          const response = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: data.projectId,
              title: task.title,
              description: task.description,
              status: "backlog",
              priority: task.priority,
              role: task.role,
              tags: JSON.stringify(["feature-builder", `phase-${phase.index + 1}`]),
            }),
          })

          if (!response.ok) {
            throw new Error(`Failed to create task: ${task.title}`)
          }

          const result = await response.json()
          createdIds.push(result.task.id)
          tempIdToRealId.set(task.id, result.task.id)

          // Create dependencies
          for (const dependsOnId of mappedDependsOn) {
            await fetch("/api/task-dependencies", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                task_id: result.task.id,
                depends_on_id: dependsOnId,
              }),
            })
          }
        }
      }

      onChange({
        taskBreakdown: {
          ...breakdown,
          createdTaskIds: createdIds,
        },
      })
    } catch (error) {
      console.error("Failed to create tasks:", error)
      onChange({
        taskBreakdown: {
          ...breakdown,
          error: error instanceof Error ? error.message : "Failed to create tasks",
        },
      })
    } finally {
      setIsCreating(false)
    }
  }

  // Show success view if tasks were created
  if (breakdown?.createdTaskIds && breakdown.createdTaskIds.length > 0) {
    return (
      <SuccessView
        taskIds={breakdown.createdTaskIds}
        projectId={data.projectId}
        onContinue={() => {}} // Parent handles navigation
      />
    )
  }

  // Loading state
  if (!breakdown || breakdown.isGenerating) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-lg font-medium">Task Breakdown</h3>
          <p className="text-sm text-muted-foreground">
            Analyzing your implementation plan and generating executable tasks...
          </p>
        </div>

        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-center space-y-1">
            <p className="text-muted-foreground">
              {breakdown?.phases.length
                ? `Generated ${breakdown.phases.length} phases so far...`
                : "Parsing implementation plan..."}
            </p>
            <p className="text-xs text-muted-foreground">
              Using GSD planning methodology
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (breakdown.error) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-lg font-medium">Task Breakdown</h3>
          <p className="text-sm text-muted-foreground">
            Something went wrong while generating tasks.
          </p>
        </div>

        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="font-medium">Error</span>
          </div>
          <p className="text-sm text-destructive/80 mt-1">{breakdown.error}</p>
        </div>

        <Button onClick={() => handleGenerate()} variant="outline" className="w-full">
          <Sparkles className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    )
  }

  // Empty state (no phases detected)
  if (breakdown.phases.length === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-lg font-medium">Task Breakdown</h3>
          <p className="text-sm text-muted-foreground">
            No phases detected in your implementation plan.
          </p>
        </div>

        <div className="p-4 bg-muted/30 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">
            Try adding numbered phases or bullet points to your implementation plan,
            then come back to this step.
          </p>
        </div>

        <Button onClick={() => handleGenerate()} variant="outline" className="w-full">
          <Sparkles className="h-4 w-4 mr-2" />
          Retry Analysis
        </Button>
      </div>
    )
  }

  // Main view with task preview
  const totalTasks = breakdown.phases.reduce((sum, p) => sum + p.tasks.length, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <FeatureBuilderStepHeader stepId="breakdown" showHelp={false} />
        <div className="flex items-center gap-2">
          <Badge variant="outline">{breakdown.phases.length} phases</Badge>
          <Badge variant="secondary">{totalTasks} tasks</Badge>
        </div>
      </div>

      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-6">
          {breakdown.phases.map((phase) => (
            <PhaseSection
              key={phase.index}
              phase={phase}
              allTasks={allTasks}
              onUpdatePhase={updatePhase}
            />
          ))}
        </div>
      </ScrollArea>

      {errors?.taskBreakdown && (
        <p className="text-xs text-destructive">{errors.taskBreakdown}</p>
      )}

      <Separator />

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => handleGenerate()}
          disabled={isCreating}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Regenerate
        </Button>

        <Button
          onClick={handleCreateTasks}
          disabled={isCreating || totalTasks === 0}
          className="flex items-center gap-2"
        >
          {isCreating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Create {totalTasks} Tasks
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
