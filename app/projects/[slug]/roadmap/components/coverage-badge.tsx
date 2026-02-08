"use client"

import { CheckCircle, AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function CoverageBadge({ coverage }: { coverage: { total: number; mapped: number; unmapped: string[] } }) {
  const percentage = coverage.total > 0 ? Math.round((coverage.mapped / coverage.total) * 100) : 0
  const complete = coverage.unmapped.length === 0 && coverage.total > 0

  return (
    <Badge
      variant={complete ? "default" : "secondary"}
      className={complete ? "bg-green-600 text-white" : "bg-amber-500 text-white"}
    >
      {complete ? (
        <CheckCircle className="h-3 w-3 mr-1" />
      ) : (
        <AlertCircle className="h-3 w-3 mr-1" />
      )}
      Coverage {percentage}%
    </Badge>
  )
}
