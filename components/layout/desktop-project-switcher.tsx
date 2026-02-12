"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const VALID_TAB_SEGMENTS = ["chat", "board", "roadmap", "sessions", "work-loop", "settings"] as const
type ValidTabSegment = (typeof VALID_TAB_SEGMENTS)[number]

function getTabSegment(pathname: string | null): ValidTabSegment {
  if (!pathname) return "chat"
  const match = pathname.match(/^\/projects\/[^\/]+\/([^\/]+)/)
  const segment = match?.[1]
  if (segment && VALID_TAB_SEGMENTS.includes(segment as ValidTabSegment)) {
    return segment as ValidTabSegment
  }
  return "chat"
}

interface Project {
  slug: string
  name: string
  color: string
}

interface DesktopProjectSwitcherProps {
  currentProject: Project
  projects?: Project[]
}

export function DesktopProjectSwitcher({ currentProject, projects = [] }: DesktopProjectSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const currentTab = getTabSegment(pathname)

  const toggleOpen = () => setIsOpen(!isOpen)
  const handleClose = () => setIsOpen(false)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        handleClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Project Switcher Button */}
      <button
        onClick={toggleOpen}
        className="flex items-center gap-3 text-left hover:bg-[var(--bg-tertiary)] rounded-lg px-2 py-1 transition-colors"
      >
        <div 
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: currentProject.color }}
        />
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          {currentProject.name}
        </h1>
        <ChevronDown className={cn(
          "h-4 w-4 text-[var(--text-secondary)] transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Dashboard Home */}
          <div className="p-1">
            <Link
              href="/"
              prefetch={false}
              onClick={handleClose}
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-md transition-colors"
            >
              <div className="text-lg">🏠</div>
              <span>Dashboard Home</span>
            </Link>
          </div>

          {/* Projects */}
          {projects.length > 0 && (
            <>
              <div className="border-t border-[var(--border)] my-1" />
              <div className="p-1 space-y-1">
                {projects.map((project) => (
                  <Link
                    key={project.slug}
                    href={`/projects/${project.slug}/${currentTab}`}
                    prefetch={false}
                    onClick={handleClose}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                      project.slug === currentProject.slug
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                    )}
                  >
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="truncate">{project.name}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}