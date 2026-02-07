"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X, Home, Activity, Bot, Settings, Repeat } from "lucide-react"
import { cn } from "@/lib/utils"

const NAVIGATION_ITEMS = [
  { id: "home", label: "Home", icon: Home, href: "/" },
  { id: "work-loop", label: "Work Loop", icon: Repeat, href: "/work-loop" },
  { id: "sessions", label: "Sessions", icon: Activity, href: "/sessions" },
  { id: "agents", label: "Agents", icon: Bot, href: "/agents" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings" },
]

interface MobileNavProps {
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
}

export function MobileNav({ isOpen, onToggle, onClose }: MobileNavProps) {
  const pathname = usePathname()

  // Close on route change
  useEffect(() => {
    onClose()
  }, [pathname, onClose])

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    
    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
      // Prevent body scroll when menu is open
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }
    
    return () => {
      document.removeEventListener("keydown", handleEscape)
      document.body.style.overflow = "unset"
    }
  }, [isOpen, onClose])

  const getActiveId = () => {
    if (pathname === "/") return "home"
    if (pathname.startsWith("/work-loop")) return "work-loop"
    if (pathname.startsWith("/sessions")) return "sessions"
    if (pathname.startsWith("/agents")) return "agents"
    if (pathname.startsWith("/settings")) return "settings"
    return "home"
  }
  const activeId = getActiveId()

  return (
    <>
      {/* Hamburger Menu Button */}
      <button
        onClick={onToggle}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)]"
        style={{ minWidth: "44px", minHeight: "44px" }}
        aria-label="Toggle navigation menu"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile Sidebar */}
      <div
        className={cn(
          "lg:hidden fixed left-0 top-0 z-50 h-screen w-80 max-w-[85vw] bg-[var(--bg-secondary)] border-r border-[var(--border)] transform transition-transform duration-200 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="p-6 pt-20 border-b border-[var(--border)]">
          <Link href="/" prefetch={false} className="flex items-center gap-3" onClick={onClose}>
            <div className="text-2xl">🦞</div>
            <div>
              <h1 className="text-lg font-bold text-[var(--text-primary)]">
                The Trap
              </h1>
              <p className="text-xs text-[var(--text-secondary)]">
                AI Agent Dashboard
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="p-4">
          <ul className="space-y-2">
            {NAVIGATION_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = activeId === item.id
              
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                      "touch-manipulation", // Better touch handling
                      isActive
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                    )}
                    style={{ minHeight: "44px" }}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </>
  )
}