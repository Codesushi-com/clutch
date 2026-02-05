import { NextRequest, NextResponse } from "next/server"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

// POST /api/work-loop/setup — Setup work loop cron jobs
export async function POST(request: NextRequest) {
  try {
    // Run the setup script
    const { stdout, stderr } = await execAsync(
      "cd /home/dan/src/trap && npx tsx scripts/work-loop/setup-crons.ts"
    )
    
    if (stderr) {
      console.error("Setup script stderr:", stderr)
    }
    
    return NextResponse.json({ 
      success: true, 
      output: stdout,
      stderr: stderr || null 
    })
  } catch (error) {
    console.error("Failed to setup work loop crons:", error)
    return NextResponse.json(
      { error: "Failed to setup work loop cron jobs", details: String(error) },
      { status: 500 }
    )
  }
}

// GET /api/work-loop/setup — Get work loop status
export async function GET() {
  try {
    // Get current cron jobs
    const { stdout } = await execAsync("openclaw cron list --json")
    const cronData = JSON.parse(stdout)
    
    const workLoopJobs = cronData.jobs?.filter((job: { jobId?: string }) => 
      job.jobId?.startsWith('trap-work-loop-')
    ) || []
    
    return NextResponse.json({ 
      jobs: workLoopJobs,
      count: workLoopJobs.length 
    })
  } catch (error) {
    console.error("Failed to get cron status:", error)
    return NextResponse.json(
      { error: "Failed to get cron status", details: String(error) },
      { status: 500 }
    )
  }
}