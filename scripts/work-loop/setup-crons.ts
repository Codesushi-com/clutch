#!/usr/bin/env npx tsx
/**
 * Setup work loop cron jobs for projects
 * Usage: npx tsx scripts/work-loop/setup-crons.ts
 */

import { getConvexClient } from "../../lib/convex/server"
import { api } from "../../convex/_generated/api"
import type { Project } from "../../lib/db/types"
import { spawn, exec as execCallback } from "child_process"
import { promisify } from "util"

const exec = promisify(execCallback)

interface CronJob {
  jobId: string
  name: string
  enabled: boolean
  schedule: {
    kind: "cron"
    expr: string
    tz?: string
  }
  payload: {
    kind: "script"
    command: string
    timeout?: number
    model: string
    thinking: string
    timeoutSeconds: number
    deliver: boolean
    channel: string
    to: string
    bestEffortDeliver: boolean
  }
  sessionTarget: "isolated"
}

async function getProjects(): Promise<Project[]> {
  const convex = getConvexClient()
  const allProjects = await convex.query(api.projects.getAll, {})
  // Filter projects with work_loop_enabled, local_path, and github_repo
  return allProjects.filter((p: Project & { task_count?: number }) =>
    p.work_loop_enabled &&
    p.local_path &&
    p.github_repo
  ) as Project[]
}

async function createCronJob(project: Project): Promise<void> {
  const jobId = `trap-work-loop-${project.slug}`
  const gatePath = "/home/dan/src/trap/scripts/work-loop/project-gate.sh"

  const cronJob: CronJob = {
    jobId,
    name: `Work loop for ${project.name}`,
    enabled: true,
    schedule: {
      kind: "cron",
      expr: project.work_loop_schedule,
      tz: "America/Los_Angeles"
    },
    payload: {
      kind: "script",
      command: `${gatePath} ${project.id}`,
      timeout: 30,
      model: "moonshot/kimi-for-coding",
      thinking: "low",
      timeoutSeconds: 1800, // 30 min
      deliver: true,
      channel: "trap",
      to: "the-trap",
      bestEffortDeliver: true
    },
    sessionTarget: "isolated"
  }

  // Remove existing cron job if it exists
  try {
    await exec(`openclaw cron remove --job-id "${jobId}" 2>/dev/null || true`)
  } catch (error) {
    // Ignore errors - job probably doesn't exist
  }

  // Create new cron job
  const jobJson = JSON.stringify(cronJob)
  const command = `openclaw cron add --job '${jobJson.replace(/'/g, "\\'")}'`

  try {
    const { stdout, stderr } = await exec(command)
    if (stderr) {
      console.error(`Error creating cron job for ${project.name}:`, stderr)
    } else {
      console.log(`✓ Created cron job for ${project.name} (${project.work_loop_schedule})`)
    }
  } catch (error) {
    console.error(`Failed to create cron job for ${project.name}:`, error)
  }
}

async function removeCronJob(projectSlug: string): Promise<void> {
  const jobId = `trap-work-loop-${projectSlug}`

  try {
    await exec(`openclaw cron remove --job-id "${jobId}"`)
    console.log(`✓ Removed cron job for ${projectSlug}`)
  } catch (error) {
    // Job probably doesn't exist, that's fine
    console.log(`- No cron job to remove for ${projectSlug}`)
  }
}

async function listExistingCrons(): Promise<string[]> {
  try {
    const { stdout } = await exec(`openclaw cron list --json`)
    const cronData = JSON.parse(stdout)
    return cronData.jobs
      .filter((job: { jobId?: string }) => job.jobId?.startsWith('trap-work-loop-'))
      .map((job: { jobId: string }) => job.jobId.replace('trap-work-loop-', ''))
  } catch (error) {
    console.error("Failed to list existing crons:", error)
    return []
  }
}

async function main() {
  console.log("Setting up work loop cron jobs...")

  const projects = await getProjects()
  console.log(`Found ${projects.length} projects with work loop enabled`)

  // Get existing cron jobs
  const existingCrons = await listExistingCrons()
  console.log(`Found ${existingCrons.length} existing work loop cron jobs`)

  // Create/update cron jobs for enabled projects
  for (const project of projects) {
    await createCronJob(project)
  }

  // Remove cron jobs for projects that are no longer enabled
  const currentProjectSlugs = new Set(projects.map(p => p.slug))
  const cronsToRemove = existingCrons.filter(slug => !currentProjectSlugs.has(slug))

  for (const slug of cronsToRemove) {
    await removeCronJob(slug)
  }

  console.log("\n✓ Work loop cron jobs setup complete")

  if (projects.length > 0) {
    console.log("\nActive work loops:")
    for (const project of projects) {
      console.log(`  - ${project.name} (${project.work_loop_schedule})`)
    }
  }
}

if (require.main === module) {
  main().catch(console.error)
}

export { createCronJob, removeCronJob, getProjects }
