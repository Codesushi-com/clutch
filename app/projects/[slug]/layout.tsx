"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, LayoutGrid, MessageSquare, Activity, Settings } from "lucide-react"
import type { Project } from "@/lib/db/types"

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

const TABS = [
  { id: "board", label: "Board", icon: LayoutGrid, href: "" },
  { id: "chat", label: "Chat", icon: MessageSquare, href: "/chat" },
  { id: "sessions", label: "Sessions", icon: Activity, href: "/sessions" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings" },
]

export default function ProjectLayout({ children, params }: LayoutProps) {
  const { slug } = use(params)
  const pathname = usePathname()
  const [project, setProject] = useState<Project | null>(null)

  useEffect(() => {
    async function fetchProject() {
      const response = await fetch(`/api/projects/${slug}`)
      if (response.ok) {
        const data = await response.json()
        setProject(data.project)
      }
    }
    fetchProject()
  }, [slug])

  // Determine active tab from pathname
  const getActiveTab = () => {
    const path = pathname.replace(`/projects/${slug}`, "")
    if (path === "" || path === "/board") return "board"
    if (path.startsWith("/chat")) return "chat"
    if (path.startsWith("/sessions")) return "sessions"
    if (path.startsWith("/settings")) return "settings"
    return "board"
  }
  const activeTab = getActiveTab()

  if (!project) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-[var(--text-secondary)]">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="container mx-auto px-4 max-w-7xl">
          {/* Top row: back + project name */}
          <div className="py-4 flex items-center gap-4">
            <Link 
              href="/"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              <h1 className="text-lg font-semibold text-[var(--text-primary)]">
                {project.name}
              </h1>
            </div>
          </div>
          
          {/* Tab navigation */}
          <nav className="flex gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              const href = `/projects/${slug}${tab.href || "/board"}`
              
              return (
                <Link
                  key={tab.id}
                  href={href}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    isActive
                      ? "bg-[var(--bg-primary)] text-[var(--text-primary)] border border-b-0 border-[var(--border)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                  }`}
                  style={isActive ? { marginBottom: -1 } : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>
      
      {/* Content */}
      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {children}
      </main>
    </div>
  )
}
