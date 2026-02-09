import { type NextRequest, NextResponse } from "next/server"
import type { FeatureBuilderData } from "@/components/feature-builder"

/**
 * POST /api/feature-builder/create
 * 
 * Creates a feature ticket and associated tasks from Feature Builder data.
 * This is the final step of the Feature Builder flow.
 */
export async function POST(request: NextRequest) {
  try {
    const data: FeatureBuilderData = await request.json()

    // Validate required fields
    if (!data.projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      )
    }

    if (!data.name?.trim()) {
      return NextResponse.json(
        { error: "Feature name is required" },
        { status: 400 }
      )
    }

    if (!data.description?.trim()) {
      return NextResponse.json(
        { error: "Feature description is required" },
        { status: 400 }
      )
    }

    // Build comprehensive task description
    const descriptionParts = [
      "## Description",
      data.description,
      "",
    ]

    // Add requirements if present
    if (data.requirements.length > 0) {
      descriptionParts.push(
        "## Requirements",
        ...data.requirements.map((req, index) => `${index + 1}. ${req}`),
        ""
      )
    }

    // Add acceptance criteria if present
    if (data.acceptanceCriteria.length > 0) {
      descriptionParts.push(
        "## Acceptance Criteria",
        ...data.acceptanceCriteria.map((ac) => `- [ ] ${ac}`),
        ""
      )
    }

    // Add design notes if present
    if (data.designNotes || data.technicalApproach) {
      descriptionParts.push("## Design & Technical Approach")
      if (data.designNotes) {
        descriptionParts.push(data.designNotes)
      }
      if (data.technicalApproach) {
        descriptionParts.push("### Technical Approach", data.technicalApproach)
      }
      descriptionParts.push("")
    }

    // Add implementation plan if present
    if (data.implementationPlan) {
      descriptionParts.push(
        "## Implementation Plan",
        data.implementationPlan,
        ""
      )
    }

    // Add estimated hours if present
    if (data.estimatedHours > 0) {
      descriptionParts.push(`**Estimated Hours:** ${data.estimatedHours}`, "")
    }

    // Add test strategy if present
    if (data.testStrategy || data.testCases.length > 0) {
      descriptionParts.push("## Testing Strategy")
      if (data.testStrategy) {
        descriptionParts.push(data.testStrategy)
      }
      if (data.testCases.length > 0) {
        descriptionParts.push(
          "### Test Cases",
          ...data.testCases.map((tc) => `- ${tc}`)
        )
      }
      descriptionParts.push("")
    }

    // Add task breakdown if present
    const generatedTasks: Array<{ title: string; description: string; priority: string; role: string }> = []
    if (data.taskBreakdown?.phases && data.taskBreakdown.phases.length > 0) {
      descriptionParts.push("## Generated Tasks")
      
      for (const phase of data.taskBreakdown.phases) {
        descriptionParts.push(`### ${phase.name}`, phase.description || "")
        
        for (const task of phase.tasks) {
          descriptionParts.push(`- **${task.title}** (${task.role}, ${task.priority})`)
          generatedTasks.push({
            title: task.title,
            description: task.description,
            priority: task.priority,
            role: task.role,
          })
        }
        descriptionParts.push("")
      }
    }

    // Add review notes if present
    if (data.reviewNotes) {
      descriptionParts.push(
        "## Review Notes",
        data.reviewNotes,
        ""
      )
    }

    const fullDescription = descriptionParts.join("\n")

    // Create the main feature task via internal API
    const taskResponse = await fetch(`${request.nextUrl.origin}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: data.projectId,
        title: data.name,
        description: fullDescription,
        status: "ready",
        priority: "high", // Features are typically high priority
        tags: JSON.stringify(["feature", "feature-builder"]),
      }),
    })

    if (!taskResponse.ok) {
      const errorText = await taskResponse.text()
      console.error("[FeatureBuilder] Failed to create task:", errorText)
      return NextResponse.json(
        { error: "Failed to create feature task" },
        { status: 500 }
      )
    }

    const taskResult = await taskResponse.json()
    const featureTaskId = taskResult.task.id

    // Create child tasks if task breakdown exists
    const createdTaskIds: string[] = [featureTaskId]
    
    if (generatedTasks.length > 0 && data.taskBreakdown?.phases) {
      for (const phase of data.taskBreakdown.phases) {
        for (const task of phase.tasks) {
          try {
            const childTaskResponse = await fetch(`${request.nextUrl.origin}/api/tasks`, {
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

            if (childTaskResponse.ok) {
              const childResult = await childTaskResponse.json()
              createdTaskIds.push(childResult.task.id)
            } else {
              console.error("[FeatureBuilder] Failed to create child task:", task.title)
            }
          } catch (err) {
            console.error("[FeatureBuilder] Error creating child task:", err)
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      taskId: featureTaskId,
      taskIds: createdTaskIds,
      tasksCreated: createdTaskIds.length,
    })

  } catch (error) {
    console.error("[FeatureBuilder] Error creating feature:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
