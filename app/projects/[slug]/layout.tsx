"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, LayoutGrid, MessageSquare, Activity, Settings } from "lucide-react"
import type { Project } from "@/lib/db/types"
import { MobileProjectSwitcher } from "@/components/layout/mobile-project-switcher"
import { DesktopProjectSwitcher } from "@/components/layout/desktop-project-switcher"
import { useMobileDetection } from "@/components/board/use-mobile-detection"

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

const TABS = [
  { id: "chat", label: "Chat", icon: MessageSquare, href: "/chat" },
  { id: "board", label: "Board", icon: LayoutGrid, href: "/board" },
  { id: "sessions", label: "Sessions", icon: Activity, href: "/sessions" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings" },
]

export default function ProjectLayout({ children, params }: LayoutProps) {
  const { slug } = use(params)
  const pathname = usePathname()
  const [project, setProject] = useState<Project | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const isMobile = useMobileDetection(1024)

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

  useEffect(() => {
    async function fetchProjects() {
      try {
        const response = await fetch('/api/projects')
        if (response.ok) {
          const data = await response.json()
          setProjects(data.projects || [])
        }
      } catch (error) {
        console.error('Failed to fetch projects:', error)
      }
    }
    fetchProjects()
  }, [])

  // Determine active tab from pathname
  const getActiveTab = () => {
    const path = pathname.replace(`/projects/${slug}`, "")
    if (path === "" || path.startsWith("/chat")) return "chat"
    if (path.startsWith("/board")) return "board"
    if (path.startsWith("/sessions")) return "sessions"
    if (path.startsWith("/settings")) return "settings"
    return "chat"
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
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)] sticky top-0 z-30">
        <div className="container mx-auto px-4 lg:px-6 max-w-7xl">
          {/* Mobile: Ultra-compact header */}
          {isMobile ? (
            <div className="py-2">
              {/* Single row: Back + Project + Tabs */}
              <div className="flex items-center gap-2">
                <Link 
                  href="/"
                  className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
                  style={{ minWidth: "40px", minHeight: "40px" }}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                
                {/* Compact project switcher */}
                <div className="flex-shrink-0">
                  <MobileProjectSwitcher 
                    currentProject={project}
                    projects={projects}
                  />
                </div>
                
                {/* Compact tab navigation - hide Settings on mobile */}
                <nav className="flex gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0">
                  {TABS.filter(tab => tab.id !== 'settings').map((tab) => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    const href = `/projects/${slug}${tab.href}`
                    
                    return (
                      <Link
                        key={tab.id}
                        href={href}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
                          isActive
                            ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                        }`}
                        style={{ minHeight: "36px" }}
                      >
                        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="text-xs">{tab.label}</span>
                      </Link>
                    )
                  })}
                </nav>
              </div>
            </div>
          ) : (
            /* Desktop: Original layout */
            <>
              {/* Top row: back + project name */}
              <div className="py-4 flex items-center gap-4">
                <Link 
                  href="/"
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <DesktopProjectSwitcher 
                  currentProject={project}
                  projects={projects}
                />
              </div>
              
              {/* Tab navigation */}
              <nav className="flex gap-1">
                {TABS.map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeTab === tab.id
                  const href = `/projects/${slug}${tab.href}`
                  
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
            </>
          )}
        </div>
      </header>
      
      {/* Content */}
      <main className={`container mx-auto px-4 py-6 ${
        activeTab === "board" 
          ? "max-w-none lg:px-6" // Full width on desktop with larger padding
          : "max-w-7xl" // Keep constraint for other pages
      }`}>
        {children}
      </main>
    </div>
  )
}
