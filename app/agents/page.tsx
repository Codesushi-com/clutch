"use client"

import dynamic from "next/dynamic"

const AgentsContent = dynamic(() => import("./agents-content"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      <div className="text-sm text-[var(--text-muted)]">Loading…</div>
    </div>
  ),
})

export default function AgentsPage() {
  return <AgentsContent />
}
