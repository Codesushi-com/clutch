#!/usr/bin/env tsx
/**
 * Trap CLI - Command line interface for Trap operations
 *
 * Usage:
 *   trap-cli deploy convex [--project <slug>]   Deploy Convex for a project
 *   trap-cli deploy check [--project <slug>]    Check if convex/ is dirty vs deployed
 */

import { execFileSync } from "node:child_process"
import { ConvexHttpClient } from "convex/browser"
import { api } from "../convex/_generated/api"
import { runConvexDeploy } from "../worker/phases/convex-deploy"

// ============================================
// Types
// ============================================

interface ProjectInfo {
  id: string
  slug: string
  name: string
  local_path?: string | null
  github_repo?: string | null
}

// ============================================
// CLI Parser
// ============================================

function parseArgs(): { command: string; args: string[]; flags: Record<string, string | boolean> } {
  const args = process.argv.slice(2)
  const flags: Record<string, string | boolean> = {}
  const positional: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith("--")) {
      const key = arg.slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith("--")) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(arg)
    }
  }

  return { command: positional.join(" "), args: positional, flags }
}

function showHelp(): void {
  console.log(`
Trap CLI - Manage your Trap projects

Usage:
  trap-cli <command> [options]

Commands:
  deploy convex [--project <slug>]   Deploy Convex schema/functions for a project
  deploy check [--project <slug>]    Check if convex/ is dirty vs deployed

Options:
  --project <slug>    Target project slug (defaults to "trap" or auto-detected)
  --help, -h          Show this help message

Examples:
  trap-cli deploy convex                    Deploy Convex for default project
  trap-cli deploy convex --project myapp    Deploy Convex for "myapp" project
  trap-cli deploy check                     Check convex/ status
`)
}

// ============================================
// Convex Client
// ============================================

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.CONVEX_URL ?? "http://127.0.0.1:3210"
  return new ConvexHttpClient(convexUrl)
}

// ============================================
// Project Resolution
// ============================================

async function resolveProject(
  convex: ConvexHttpClient,
  slug?: string
): Promise<ProjectInfo | null> {
  // If slug provided, look it up directly
  if (slug) {
    const project = await convex.query(api.projects.getBySlug, { slug })
    return project
  }

  // Try to auto-detect from current directory
  const detectedSlug = detectProjectFromCwd()
  if (detectedSlug) {
    const project = await convex.query(api.projects.getBySlug, { slug: detectedSlug })
    if (project) {
      return project
    }
  }

  // Fall back to "trap" project
  const trapProject = await convex.query(api.projects.getBySlug, { slug: "trap" })
  if (trapProject) {
    return trapProject
  }

  // Last resort: return first project with local_path
  const allProjects = await convex.query(api.projects.getAll, {})
  const withPath = allProjects.find((p: ProjectInfo) => p.local_path)
  return withPath ?? null
}

/**
 * Try to detect project slug from current working directory.
 * Looks for patterns like /path/to/project-name or /path/to/project-name-worktrees/...
 */
function detectProjectFromCwd(): string | null {
  const cwd = process.cwd()

  // Match patterns like:
  // /home/user/src/my-project
  // /home/user/src/my-project-worktrees/fix/abc123
  const match = cwd.match(/[/\\]([^/\\]+?)(?:-worktrees(?:[/\\]|$)|$)/)
  if (match) {
    return match[1]
  }

  // Try to get from git remote
  try {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf-8",
      timeout: 5000,
    })
    const repoMatch = remote.match(/\/([^/]+?)(?:\.git)?\s*$/)
    if (repoMatch) {
      return repoMatch[1]
    }
  } catch {
    // Ignore git errors
  }

  return null
}

// ============================================
// Commands
// ============================================

async function cmdDeployConvex(project: ProjectInfo): Promise<void> {
  if (!project.local_path) {
    console.error(`Error: Project "${project.slug}" has no local_path configured`)
    process.exit(1)
  }

  console.log(`Deploying Convex for project: ${project.slug}`)
  console.log(`Working directory: ${project.local_path}`)

  const result = runConvexDeploy(project)

  if (result.success) {
    console.log("✓ Convex deploy succeeded")
    console.log(result.output)
    process.exit(0)
  } else {
    console.error("✗ Convex deploy failed")
    console.error(result.output)
    process.exit(1)
  }
}

async function cmdDeployCheck(
  convex: ConvexHttpClient,
  project: ProjectInfo
): Promise<void> {
  if (!project.local_path) {
    console.error(`Error: Project "${project.slug}" has no local_path configured`)
    process.exit(1)
  }

  if (!project.github_repo) {
    console.error(`Error: Project "${project.slug}" has no github_repo configured`)
    process.exit(1)
  }

  console.log(`Checking convex/ status for project: ${project.slug}`)

  // Get the latest deployed version info
  // We use git to check if convex/ files differ between HEAD and origin/main
  try {
    const diffOutput = execFileSync(
      "git",
      ["diff", "--name-only", "origin/main...HEAD"],
      {
        encoding: "utf-8",
        timeout: 10000,
        cwd: project.local_path,
      }
    )

    const files = diffOutput.split("\n").filter((f) => f.trim().length > 0)
    const convexFiles = files.filter((f) => f.startsWith("convex/"))

    if (convexFiles.length === 0) {
      console.log("✓ convex/ directory is clean (no changes since origin/main)")
      console.log("\nNote: This only checks committed changes. Uncommitted changes are not detected.")
      process.exit(0)
    }

    console.log(`✗ convex/ has ${convexFiles.length} changed file(s) not on origin/main:`)
    for (const file of convexFiles) {
      console.log(`  - ${file}`)
    }
    console.log("\nRun 'trap-cli deploy convex' to deploy these changes.")
    process.exit(1)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Error checking convex/ status: ${message}`)
    process.exit(1)
  }
}

// ============================================
// Main Entry Point
// ============================================

async function main(): Promise<void> {
  const { command, flags } = parseArgs()

  // Show help
  if (flags.help || flags.h || !command) {
    showHelp()
    process.exit(0)
  }

  // Initialize Convex client
  const convex = getConvexClient()

  // Resolve target project
  const projectSlug = typeof flags.project === "string" ? flags.project : undefined
  const project = await resolveProject(convex, projectSlug)

  if (!project) {
    console.error(
      projectSlug
        ? `Error: Project "${projectSlug}" not found`
        : "Error: Could not determine project. Use --project <slug> to specify."
    )
    process.exit(1)
  }

  // Route to appropriate command
  switch (command) {
    case "deploy convex":
      await cmdDeployConvex(project)
      break
    case "deploy check":
      await cmdDeployCheck(convex, project)
      break
    default:
      console.error(`Unknown command: ${command}`)
      console.error("Run 'trap-cli --help' for usage information.")
      process.exit(1)
  }
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
