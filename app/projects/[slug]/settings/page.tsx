"use client"

import { use } from "react"
import { Settings } from "lucide-react"

type PageProps = {
  params: Promise<{ slug: string }>
}

export default function SettingsPage({ params }: PageProps) {
  const { slug } = use(params)

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Settings className="h-12 w-12 text-[var(--text-tertiary)] mb-4" />
      <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
        Project Settings
      </h2>
      <p className="text-[var(--text-secondary)] max-w-md">
        Settings for <span className="font-medium">{slug}</span> coming soon.
        This will include project config, agent assignments, and context paths.
      </p>
    </div>
  )
}
