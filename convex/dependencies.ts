// Task dependency query helpers
import { db } from "@/lib/db"
import type { TaskDependency, TaskSummary } from "@/lib/db/types"

// Extended type that includes the dependency relationship ID
export interface TaskDependencySummary extends TaskSummary {
  dependency_id: string
}

/**
 * Get all dependencies for a task (tasks it depends on)
 */
export function getByTask(taskId: string): TaskDependencySummary[] {
  const rows = db.prepare(`
    SELECT t.id, t.title, t.status, td.id as dependency_id
    FROM tasks t
    JOIN task_dependencies td ON t.id = td.depends_on_id
    WHERE td.task_id = ?
    ORDER BY t.created_at DESC
  `).all(taskId) as TaskDependencySummary[]
  
  return rows
}

/**
 * Get all tasks that depend on this task (are blocked by it)
 */
export function getBlockedTasks(taskId: string): TaskSummary[] {
  const rows = db.prepare(`
    SELECT t.id, t.title, t.status
    FROM tasks t
    JOIN task_dependencies td ON t.id = td.task_id
    WHERE td.depends_on_id = ?
    ORDER BY t.created_at DESC
  `).all(taskId) as TaskSummary[]
  
  return rows
}

/**
 * Get incomplete dependencies for a task
 * Returns tasks that this task depends on which are NOT in "done" status
 * Used for validation before allowing task to start/complete
 */
export function getIncomplete(taskId: string): TaskSummary[] {
  const rows = db.prepare(`
    SELECT t.id, t.title, t.status
    FROM tasks t
    JOIN task_dependencies td ON t.id = td.depends_on_id
    WHERE td.task_id = ?
      AND t.status != 'done'
    ORDER BY t.created_at DESC
  `).all(taskId) as TaskSummary[]
  
  return rows
}

/**
 * Check if a task has any incomplete dependencies
 * Returns true if there are blocking dependencies
 */
export function hasIncomplete(taskId: string): boolean {
  const row = db.prepare(`
    SELECT 1
    FROM tasks t
    JOIN task_dependencies td ON t.id = td.depends_on_id
    WHERE td.task_id = ?
      AND t.status != 'done'
    LIMIT 1
  `).get(taskId)
  
  return row !== undefined
}

/**
 * Get a specific dependency by its ID
 */
export function getById(depId: string): TaskDependency | undefined {
  return db.prepare("SELECT * FROM task_dependencies WHERE id = ?").get(depId) as TaskDependency | undefined
}

/**
 * Check if a dependency already exists between two tasks
 */
export function exists(taskId: string, dependsOnId: string): boolean {
  const row = db.prepare(
    "SELECT 1 FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?"
  ).get(taskId, dependsOnId)
  return row !== undefined
}

/**
 * Create a new dependency
 * Does NOT check for cycles - use wouldCreateCycle() before calling
 */
export function create(taskId: string, dependsOnId: string): TaskDependency {
  const id = crypto.randomUUID()
  const now = Date.now()
  
  const dep: TaskDependency = {
    id,
    task_id: taskId,
    depends_on_id: dependsOnId,
    created_at: now,
  }
  
  db.prepare(`
    INSERT INTO task_dependencies (id, task_id, depends_on_id, created_at)
    VALUES (@id, @task_id, @depends_on_id, @created_at)
  `).run(dep)
  
  return dep
}

/**
 * Delete a dependency by its ID
 */
export function deleteById(depId: string): boolean {
  const result = db.prepare("DELETE FROM task_dependencies WHERE id = ?").run(depId)
  return result.changes > 0
}

/**
 * Delete a dependency by task relationship
 */
export function deleteByRelationship(taskId: string, dependsOnId: string): boolean {
  const result = db.prepare(
    "DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?"
  ).run(taskId, dependsOnId)
  return result.changes > 0
}

/**
 * Check if adding a dependency would create a circular dependency
 * Returns true if a cycle would be created
 */
export function wouldCreateCycle(taskId: string, dependsOnId: string): boolean {
  // Direct self-dependency
  if (taskId === dependsOnId) {
    return true
  }
  
  // BFS from dependsOnId to see if we can reach taskId
  const visited = new Set<string>()
  const queue: string[] = [dependsOnId]
  
  while (queue.length > 0) {
    const current = queue.shift()!
    
    if (current === taskId) {
      return true
    }
    
    if (visited.has(current)) {
      continue
    }
    visited.add(current)
    
    // Get all tasks that current depends on
    const deps = db.prepare(
      "SELECT depends_on_id FROM task_dependencies WHERE task_id = ?"
    ).all(current) as Array<{ depends_on_id: string }>
    
    for (const dep of deps) {
      if (!visited.has(dep.depends_on_id)) {
        queue.push(dep.depends_on_id)
      }
    }
  }
  
  return false
}

/**
 * Get full dependency chain for a task (all transitive dependencies)
 */
export function getDependencyChain(taskId: string): string[] {
  const chain: string[] = []
  const visited = new Set<string>()
  const queue: string[] = [taskId]
  
  while (queue.length > 0) {
    const current = queue.shift()!
    
    if (visited.has(current)) {
      continue
    }
    visited.add(current)
    
    // Get all tasks that current depends on
    const deps = db.prepare(
      "SELECT depends_on_id FROM task_dependencies WHERE task_id = ?"
    ).all(current) as Array<{ depends_on_id: string }>
    
    for (const dep of deps) {
      if (!visited.has(dep.depends_on_id)) {
        chain.push(dep.depends_on_id)
        queue.push(dep.depends_on_id)
      }
    }
  }
  
  return chain
}

/**
 * Get all dependency relationships for a project
 */
export function getByProject(projectId: string): Array<TaskDependency & { task_title: string; depends_on_title: string }> {
  const rows = db.prepare(`
    SELECT 
      td.*,
      t.title as task_title,
      dt.title as depends_on_title
    FROM task_dependencies td
    JOIN tasks t ON td.task_id = t.id
    JOIN tasks dt ON td.depends_on_id = dt.id
    WHERE t.project_id = ?
    ORDER BY td.created_at DESC
  `).all(projectId) as Array<TaskDependency & { task_title: string; depends_on_title: string }>
  
  return rows
}
