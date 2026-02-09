"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { Sidebar } from "./sidebar"
import { MobileNav } from "./mobile-nav"
import { MobileBottomNav } from "./mobile-bottom-nav"

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const pathname = usePathname()
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  // Don't apply main layout on project pages (they have their own layout)
  if (pathname.startsWith('/projects/')) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <Sidebar />
      <MobileNav 
        isOpen={isMobileNavOpen}
        onToggle={() => setIsMobileNavOpen(!isMobileNavOpen)}
        onClose={() => setIsMobileNavOpen(false)}
      />
      <main className="lg:ml-64 pt-16 lg:pt-0 pb-20 lg:pb-0">
        {children}
      </main>
      <MobileBottomNav />
    </div>
  )
}