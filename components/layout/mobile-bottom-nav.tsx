"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Activity, Bot, Settings, Repeat } from "lucide-react"
import { cn } from "@/lib/utils"

const BOTTOM_NAV_ITEMS = [
  { id: "home", label: "Home", icon: Home, href: "/" },
  { id: "work-loop", label: "Loop", icon: Repeat, href: "/work-loop" },
  { id: "sessions", label: "Sessions", icon: Activity, href: "/sessions" },
  { id: "agents", label: "Agents", icon: Bot, href: "/agents" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings" },
]

export function MobileBottomNav() {
  const pathname = usePathname()

  // Don't show bottom nav on project pages (they have their own navigation)
  if (pathname.startsWith('/projects/')) {
    return null
  }

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
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-secondary)] border-t border-[var(--border)] pb-safe">
      <div className="flex items-center justify-around px-2 py-1">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = activeId === item.id
          
          return (
            <Link
              key={item.id}
              href={item.href}
              prefetch={false}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors",
                "touch-manipulation min-w-0 flex-1 max-w-20",
                isActive
                  ? "text-[var(--accent)] bg-[var(--accent)]/10"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
              style={{ minHeight: "44px" }}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}