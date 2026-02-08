"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Activity, Bot, Settings, Repeat, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

const NAVIGATION_ITEMS = [
  { id: "home", label: "Home", icon: Home, href: "/" },
  { id: "work-loop", label: "Observatory", icon: Repeat, href: "/work-loop" },
  { id: "sessions", label: "Sessions", icon: Activity, href: "/sessions" },
  { id: "agents", label: "Agents", icon: Bot, href: "/agents" },
  { id: "prompts", label: "Prompt Lab", icon: FileText, href: "/prompts" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings" },
]

export function Sidebar() {
  const pathname = usePathname()

  // Don't show sidebar on project pages (they have their own navigation)
  if (pathname.startsWith('/projects/')) {
    return null
  }

  const getActiveId = () => {
    if (pathname === "/") return "home"
    if (pathname.startsWith("/work-loop")) return "work-loop"
    if (pathname.startsWith("/sessions")) return "sessions"
    if (pathname.startsWith("/agents")) return "agents"
    if (pathname.startsWith("/prompts")) return "prompts"
    if (pathname.startsWith("/settings")) return "settings"
    return "home"
  }
  const activeId = getActiveId()

  return (
    <div className="hidden lg:block fixed left-0 top-0 z-40 h-screen w-64 bg-[var(--bg-secondary)] border-r border-[var(--border)]">
      {/* Header */}
      <div className="p-6 border-b border-[var(--border)]">
        <Link href="/" prefetch={false} className="flex items-center gap-3">
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
        <ul className="space-y-1">
          {NAVIGATION_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = activeId === item.id
            
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  prefetch={false}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                    isActive
                      ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}