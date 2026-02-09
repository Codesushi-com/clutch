import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { repo } = await request.json()
    
    if (!repo || typeof repo !== 'string') {
      return NextResponse.json(
        { error: "Repository is required and must be a string" },
        { status: 400 }
      )
    }

    const normalizedRepo = repo.trim()
    
    // Validate format (owner/repository)
    if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(normalizedRepo)) {
      return NextResponse.json({
        accessible: false,
        error: "Repository must be in owner/repository format"
      })
    }

    try {
      // Use GitHub's public API to check if repository exists and is accessible
      const response = await fetch(`https://api.github.com/repos/${normalizedRepo}`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'OpenClutch-Project-Settings',
        },
      })

      if (response.status === 200) {
        const repoData = await response.json()
        return NextResponse.json({
          accessible: true,
          name: repoData.name,
          full_name: repoData.full_name,
          private: repoData.private,
          default_branch: repoData.default_branch,
          description: repoData.description,
        })
      } else if (response.status === 404) {
        return NextResponse.json({
          accessible: false,
          error: "Repository not found or is private"
        })
      } else if (response.status === 403) {
        return NextResponse.json({
          accessible: false,
          error: "Rate limited by GitHub API"
        })
      } else {
        return NextResponse.json({
          accessible: false,
          error: `GitHub API error: ${response.status}`
        })
      }
      
    } catch (err) {
      return NextResponse.json({
        accessible: false,
        error: `Network error: ${err instanceof Error ? err.message : 'Unknown error'}`
      })
    }
    
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    )
  }
}