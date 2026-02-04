"use client"

import { usePathname } from "next/navigation"
import { Sidebar } from "./sidebar"

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const pathname = usePathname()

  // Don't apply main layout on project pages (they have their own layout)
  if (pathname.startsWith('/projects/')) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <Sidebar />
      <main className="ml-64">
        {children}
      </main>
    </div>
  )
}