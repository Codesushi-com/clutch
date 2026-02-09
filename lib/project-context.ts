/**
 * Project Context Builder
 * 
 * Generates context information about a project for AI agent sessions.
 * Includes project metadata and key files from the local codebase.
 */

import fs from "fs"
import path from "path"
import type { Project } from "@/lib/types"

// Key files to look for in project directories (in priority order)
const KEY_FILES = [
  "AGENTS.md",        // Agent instructions
  "README.md",        // Project overview
  "CONTRIBUTING.md",  // Contribution guidelines
  "ARCHITECTURE.md",  // Architecture docs
  ".cursorrules",     // Cursor AI rules (often has project context)
  ".clinerules",      // Cline rules
  "docs/OVERVIEW.md", // Common docs location
]

// Maximum size per file to include (50KB)
const MAX_FILE_SIZE = 50 * 1024

// Maximum total context size (200KB)
const MAX_TOTAL_SIZE = 200 * 1024

export interface ProjectContext {
  project: {
    name: string
    description: string | null
    slug: string
    localPath: string | null
    githubRepo: string | null
  }
  files: Array<{
    path: string
    content: string
    truncated: boolean
  }>
  workingDirectory: string | null
  contextSize: number
}

/**
 * Read a file safely with size limits
 */
function readFileSafe(filePath: string, maxSize: number): { content: string; truncated: boolean } | null {
  try {
    const stats = fs.statSync(filePath)
    if (!stats.isFile()) return null
    
    const content = fs.readFileSync(filePath, "utf-8")
    if (content.length > maxSize) {
      return {
        content: content.slice(0, maxSize) + "\n\n... [truncated]",
        truncated: true,
      }
    }
    
    return { content, truncated: false }
  } catch {
    return null
  }
}

/**
 * Build context for a project
 */
export function buildProjectContext(project: Project): ProjectContext {
  const context: ProjectContext = {
    project: {
      name: project.name,
      description: project.description,
      slug: project.slug,
      localPath: project.local_path,
      githubRepo: project.github_repo,
    },
    files: [],
    workingDirectory: project.local_path,
    contextSize: 0,
  }
  
  if (!project.local_path) {
    return context
  }
  
  // Check if local path exists
  if (!fs.existsSync(project.local_path)) {
    return context
  }
  
  let totalSize = 0
  
  // Read key files
  for (const fileName of KEY_FILES) {
    if (totalSize >= MAX_TOTAL_SIZE) break
    
    const filePath = path.join(project.local_path, fileName)
    const remainingSize = MAX_TOTAL_SIZE - totalSize
    const maxFileSize = Math.min(MAX_FILE_SIZE, remainingSize)
    
    const result = readFileSafe(filePath, maxFileSize)
    if (result) {
      context.files.push({
        path: fileName,
        content: result.content,
        truncated: result.truncated,
      })
      totalSize += result.content.length
    }
  }
  
  context.contextSize = totalSize
  
  return context
}

/**
 * Format project context as a system prompt section
 */
export function formatProjectContext(context: ProjectContext): string {
  const sections: string[] = []
  
  // Project header
  sections.push(`## Project: ${context.project.name}`)
  
  if (context.project.description) {
    sections.push(context.project.description)
  }
  
  sections.push("")
  
  // Metadata
  const metadata: string[] = []
  if (context.workingDirectory) {
    metadata.push(`- **Working Directory:** \`${context.workingDirectory}\``)
  }
  if (context.project.githubRepo) {
    metadata.push(`- **GitHub:** ${context.project.githubRepo}`)
  }
  
  if (metadata.length > 0) {
    sections.push(metadata.join("\n"))
    sections.push("")
  }
  
  // Files
  if (context.files.length > 0) {
    sections.push("### Project Files")
    sections.push("")
    
    for (const file of context.files) {
      sections.push(`#### ${file.path}${file.truncated ? " (truncated)" : ""}`)
      sections.push("```")
      sections.push(file.content)
      sections.push("```")
      sections.push("")
    }
  }
  
  return sections.join("\n")
}

/**
 * Build and format project context in one step
 */
export function getFormattedProjectContext(project: Project): string | null {
  const context = buildProjectContext(project)
  
  // Only return if we have meaningful context
  if (!context.workingDirectory && context.files.length === 0) {
    // Still include basic project info
    if (context.project.name || context.project.description || context.project.githubRepo) {
      return formatProjectContext(context)
    }
    return null
  }
  
  return formatProjectContext(context)
}
