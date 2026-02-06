// Task dependency query helpers - Convex version
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import type { TaskDependency, TaskSummary, TaskDependencySummary } from "@/lib/types"

// Extended type that includes the dependency relationship ID
export { TaskDependencySummary }

// Get all tasks that this task depends on
export async function getTaskDependencies(taskId: string): Promise<TaskDependencySummary[]> {
  const convex = getConvexClient()
  return await convex.query(api.taskDependencies.getDependencies, { taskId })
}

// Get all tasks that depend on this task (are blocked by it)
export async function getTasksBlockedBy(taskId: string): Promise<TaskSummary[]> {
  const convex = getConvexClient()
  return await convex.query(api.taskDependencies.getBlockedBy, { taskId })
}

// Get incomplete dependencies for a task
export async function getIncompleteDependencies(taskId: string): Promise<TaskSummary[]> {
  const convex = getConvexClient()
  return await convex.query(api.taskDependencies.getIncomplete, { taskId })
}

// Check if a dependency already exists
export async function dependencyExists(taskId: string, dependsOnId: string): Promise<boolean> {
  const convex = getConvexClient()
  return await convex.query(api.taskDependencies.exists, { taskId, dependsOnId })
}

// Add a new dependency
export async function addDependency(taskId: string, dependsOnId: string): Promise<TaskDependency> {
  const convex = getConvexClient()
  return await convex.mutation(api.taskDependencies.add, { taskId, dependsOnId })
}

// Remove a dependency by ID
export async function removeDependency(depId: string): Promise<boolean> {
  const convex = getConvexClient()
  return await convex.mutation(api.taskDependencies.remove, { id: depId })
}

// Remove a dependency by task relationship
export async function removeDependencyByRelationship(taskId: string, dependsOnId: string): Promise<boolean> {
  const convex = getConvexClient()
  return await convex.mutation(api.taskDependencies.removeByRelationship, { taskId, dependsOnId })
}

// Check if adding a dependency would create a circular dependency
export async function wouldCreateCycle(taskId: string, dependsOnId: string): Promise<boolean> {
  const convex = getConvexClient()
  return await convex.query(api.taskDependencies.wouldCreateCycle, { taskId, dependsOnId })
}

// Get full dependency chain for a task (all transitive dependencies)
export async function getDependencyChain(taskId: string): Promise<string[]> {
  const chain: string[] = []
  const visited = new Set<string>()
  const queue: string[] = [taskId]

  const convex = getConvexClient()

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)

    const deps = await convex.query(api.taskDependencies.getDependencies, { taskId: current })
    for (const dep of deps) {
      if (!visited.has(dep.id)) {
        chain.push(dep.id)
        queue.push(dep.id)
      }
    }
  }

  return chain
}
