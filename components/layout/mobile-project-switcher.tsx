"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { getTabSegment } from "@/lib/project-navigation"

interface Project {
  slug: string
  name: string
  color: string
}

interface MobileProjectSwitcherProps {
  currentProject: Project
  projects?: Project[]
}

export function MobileProjectSwitcher({ currentProject, projects = [] }: MobileProjectSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const currentTab = getTabSegment(pathname)

  const toggleOpen = () => setIsOpen(!isOpen)
  const handleClose = () => setIsOpen(false)

  return (
    <>
      {/* Project Switcher Button - compact for mobile */}
      <button
        onClick={toggleOpen}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-[var(--text-primary)] bg-[var(--bg-tertiary)] rounded-md transition-colors hover:bg-[var(--bg-secondary)]"
        style={{ minHeight: "36px" }}
      >
        <div 
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: currentProject.color }}
        />
        <span className="truncate text-xs">{currentProject.name}</span>
        <ChevronDown className={cn(
          "h-3.5 w-3.5 transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-50"
            onClick={handleClose}
          />
          <div className="fixed inset-x-4 top-20 z-50 max-h-[80vh] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                Switch Project
              </h3>
              <button
                onClick={handleClose}
                className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                style={{ minWidth: "44px", minHeight: "44px" }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Project List */}
            <div className="max-h-96 overflow-y-auto">
              <div className="p-2">
                <Link
                  href="/"
                  prefetch={false}
                  onClick={handleClose}
                  className="flex items-center gap-3 px-3 py-3 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                  style={{ minHeight: "44px" }}
                >
                  <div className="text-lg">🏠</div>
                  <span>Dashboard Home</span>
                </Link>
              </div>

              {projects.length > 0 && (
                <div className="p-2 space-y-1">
                  {projects.map((project) => (
                    <Link
                      key={project.slug}
                      href={`/projects/${project.slug}/${currentTab}`}
                      prefetch={false}
                      onClick={handleClose}
                      className={cn(
                        "flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-lg transition-colors",
                        project.slug === currentProject.slug
                          ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                      )}
                      style={{ minHeight: "44px" }}
                    >
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      <span>{project.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}