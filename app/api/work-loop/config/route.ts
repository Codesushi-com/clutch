import { NextRequest, NextResponse } from "next/server"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

const ENV_PATH = join(process.cwd(), ".env.local")

// Keys we allow reading/writing
const ALLOWED_KEYS = [
  "WORK_LOOP_ENABLED",
  "WORK_LOOP_MAX_AGENTS",
  "WORK_LOOP_MAX_AGENTS_PER_PROJECT",
  "WORK_LOOP_MAX_DEV_AGENTS",
  "WORK_LOOP_MAX_REVIEWER_AGENTS",
  "WORK_LOOP_STALE_TASK_MINUTES",
  "WORK_LOOP_STALE_REVIEW_MINUTES",
  "WORK_LOOP_CYCLE_MS",
]

async function readEnvFile(): Promise<Map<string, string>> {
  const content = await readFile(ENV_PATH, "utf-8")
  const env = new Map<string, string>()
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/)
    if (match) {
      env.set(match[1], match[2])
    }
  }
  return env
}

async function writeEnvFile(env: Map<string, string>): Promise<void> {
  const lines: string[] = []
  for (const [key, value] of env) {
    lines.push(`${key}=${value}`)
  }
  await writeFile(ENV_PATH, lines.join("\n") + "\n")
}

/**
 * GET /api/work-loop/config
 * Returns current work loop env config
 */
export async function GET() {
  try {
    const env = await readEnvFile()
    const config: Record<string, string> = {}
    for (const key of ALLOWED_KEYS) {
      const val = env.get(key)
      if (val !== undefined) config[key] = val
    }
    return NextResponse.json({ config })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/work-loop/config
 * Update work loop env config values
 * Body: { "WORK_LOOP_MAX_DEV_AGENTS": "1", ... }
 */
export async function PATCH(request: NextRequest) {
  try {
    const updates = await request.json() as Record<string, string>

    // Validate keys
    for (const key of Object.keys(updates)) {
      if (!ALLOWED_KEYS.includes(key)) {
        return NextResponse.json(
          { error: `Invalid config key: ${key}` },
          { status: 400 }
        )
      }
    }

    const env = await readEnvFile()
    for (const [key, value] of Object.entries(updates)) {
      env.set(key, String(value))
    }
    await writeEnvFile(env)

    // Return updated config
    const config: Record<string, string> = {}
    for (const key of ALLOWED_KEYS) {
      const val = env.get(key)
      if (val !== undefined) config[key] = val
    }

    return NextResponse.json({
      config,
      note: "Config written to .env.local. Restart the work loop process for changes to take effect.",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
