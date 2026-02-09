import { NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

// Server start time - captured when this module is first loaded
const SERVER_STARTED_AT = Date.now()

/**
 * Format milliseconds into a human-readable duration string
 * e.g., "2h 15m" or "45s"
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    const remainingHours = hours % 24
    return `${days}d ${remainingHours}h`
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }
  return `${seconds}s`
}

/**
 * Format a timestamp into a relative time string
 * e.g., "5 minutes ago"
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours} hour${hours !== 1 ? "s" : ""} ago`
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`
  }
  return `${seconds} second${seconds !== 1 ? "s" : ""} ago`
}

/**
 * Format a timestamp into an absolute time string
 * e.g., "Feb 8, 2025, 2:42 PM"
 */
function formatAbsoluteTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })
}

/**
 * Get the current git commit hash
 */
async function getGitCommit(): Promise<string | null> {
  try {
    // Try to read from .git/HEAD
    const headPath = join(process.cwd(), ".git", "HEAD")
    const headContent = await readFile(headPath, "utf-8")
    const ref = headContent.trim().replace("ref: ", "")

    // Read the actual commit from the ref file
    const refPath = join(process.cwd(), ".git", ref)
    const commit = await readFile(refPath, "utf-8")
    return commit.trim().slice(0, 7)
  } catch {
    // Fallback: try to read from packed-refs or return null
    return null
  }
}

/**
 * Get version info from package.json
 */
async function getPackageVersion(): Promise<string | null> {
  try {
    const packagePath = join(process.cwd(), "package.json")
    const content = await readFile(packagePath, "utf-8")
    const pkg = JSON.parse(content) as { version?: string }
    return pkg.version ?? null
  } catch {
    return null
  }
}

export interface ServerStatus {
  startedAt: number
  startedAtFormatted: string
  startedAtRelative: string
  uptime: number
  uptimeFormatted: string
  version: string | null
  commit: string | null
  nodeVersion: string
  platform: string
}

/**
 * GET /api/status
 * Returns server status information including start time, uptime, and version
 */
export async function GET(): Promise<NextResponse<ServerStatus | { error: string }>> {
  try {
    const now = Date.now()
    const uptime = now - SERVER_STARTED_AT

    const [commit, version] = await Promise.all([
      getGitCommit(),
      getPackageVersion(),
    ])

    const status: ServerStatus = {
      startedAt: SERVER_STARTED_AT,
      startedAtFormatted: formatAbsoluteTime(SERVER_STARTED_AT),
      startedAtRelative: formatRelativeTime(SERVER_STARTED_AT),
      uptime,
      uptimeFormatted: formatDuration(uptime),
      version,
      commit,
      nodeVersion: process.version,
      platform: process.platform,
    }

    return NextResponse.json(status)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
