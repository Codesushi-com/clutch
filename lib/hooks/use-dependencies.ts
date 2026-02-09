"use client"

import { useState, useEffect, useCallback } from "react"
import type { TaskDependencySummary, TaskSummary } from "@/lib/types"

interface DependenciesData {
  depends_on: TaskDependencySummary[]
  blocks: TaskSummary[]
}

interface UseDependenciesReturn {
  dependencies: DependenciesData
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useDependencies(taskId: string | null): UseDependenciesReturn {
  const [dependencies, setDependencies] = useState<DependenciesData>({
    depends_on: [],
    blocks: [],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDependencies = useCallback(async () => {
    if (!taskId) {
      setDependencies({ depends_on: [], blocks: [] })
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/tasks/${taskId}/dependencies`)
      if (!response.ok) {
        throw new Error("Failed to fetch dependencies")
      }
      const data = await response.json()
      setDependencies(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    fetchDependencies()
  }, [fetchDependencies])

  return {
    dependencies,
    loading,
    error,
    refresh: fetchDependencies,
  }
}
