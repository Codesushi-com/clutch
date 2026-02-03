"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Project } from "@/lib/db/types"

type PageProps = {
  params: Promise<{ slug: string }>
}

export default function ProjectPage({ params }: PageProps) {
  const { slug } = use(params)
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProject() {
      const response = await fetch(`/api/projects/${slug}`)
      if (!response.ok) {
        setError("Project not found")
        setLoading(false)
        return
      }
      const data = await response.json()
      setProject(data.project)
      setLoading(false)
    }
    fetchProject()
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-[var(--text-secondary)]">Loading...</div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
            Project not found
          </h2>
          <Link href="/">
            <Button variant="outline">Back to projects</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <main className="container mx-auto py-8 px-4 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to projects
          </Link>
          
          <div className="flex items-center gap-4">
            <div 
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {project.name}
            </h1>
          </div>
          
          {project.description && (
            <p className="mt-2 text-[var(--text-secondary)]">
              {project.description}
            </p>
          )}
        </div>

        {/* Placeholder content */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-8 text-center">
          <div className="text-4xl mb-4">🚧</div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            Board coming soon
          </h2>
          <p className="text-[var(--text-secondary)]">
            Task board, chat, and sessions will be available in upcoming issues.
          </p>
        </div>
      </main>
    </div>
  )
}
