"use client"

import { useCallback, useMemo } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"

export type TimeRange = "1h" | "24h" | "7d" | "30d" | "all"

export interface ObservatoryFilters {
  /** Selected project ID, or null for "All Projects" */
  projectId: string | null
  /** Selected time range for data display */
  timeRange: TimeRange
  /** Set the project filter (null = All Projects) */
  setProjectId: (projectId: string | null) => void
  /** Set the time range filter */
  setTimeRange: (range: TimeRange) => void
  /** Build a URL with the current filters applied */
  buildUrl: (pathname: string) => string
}

const DEFAULT_TIME_RANGE: TimeRange = "7d"

/**
 * Hook for managing Observatory filter state (project + time range).
 * 
 * Persists filter state to URL search params:
 * - `?project=clutch&range=7d`
 * - `?range=24h` (no project = All Projects)
 * 
 * Use this hook across all Observatory tabs to maintain filter
 * consistency during navigation.
 * 
 * @param lockedProjectId - If provided, project filter is locked to this value (for per-project pages)
 */
export function useObservatoryFilters(lockedProjectId?: string): ObservatoryFilters {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Parse current values from URL
  const projectId = useMemo(() => {
    if (lockedProjectId) return lockedProjectId
    const param = searchParams.get("project")
    return param || null
  }, [searchParams, lockedProjectId])

  const timeRange = useMemo<TimeRange>(() => {
    const param = searchParams.get("range") as TimeRange | null
    const validRanges: TimeRange[] = ["1h", "24h", "7d", "30d", "all"]
    return param && validRanges.includes(param) ? param : DEFAULT_TIME_RANGE
  }, [searchParams])

  // Update URL with new project filter
  const setProjectId = useCallback(
    (newProjectId: string | null) => {
      if (lockedProjectId) return // Can't change locked filter

      const params = new URLSearchParams(searchParams.toString())
      if (newProjectId) {
        params.set("project", newProjectId)
      } else {
        params.delete("project")
      }

      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams, lockedProjectId]
  )

  // Update URL with new time range
  const setTimeRange = useCallback(
    (newRange: TimeRange) => {
      const params = new URLSearchParams(searchParams.toString())
      if (newRange === DEFAULT_TIME_RANGE) {
        params.delete("range")
      } else {
        params.set("range", newRange)
      }

      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  // Build a URL to another page with current filters preserved
  const buildUrl = useCallback(
    (targetPathname: string) => {
      const params = new URLSearchParams()
      if (projectId) params.set("project", projectId)
      if (timeRange !== DEFAULT_TIME_RANGE) params.set("range", timeRange)

      const queryString = params.toString()
      return queryString ? `${targetPathname}?${queryString}` : targetPathname
    },
    [projectId, timeRange]
  )

  return {
    projectId,
    timeRange,
    setProjectId,
    setTimeRange,
    buildUrl,
  }
}
