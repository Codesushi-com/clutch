"use client"

import { useState, useCallback } from "react"

export interface ObservatoryFilters {
  selectedProjectId: string | "all"
}

export interface ObservatoryFiltersState extends ObservatoryFilters {
  setSelectedProject: (projectId: string | "all") => void
  clearFilters: () => void
}

export function useObservatoryFilters(): ObservatoryFiltersState {
  const [selectedProjectId, setSelectedProjectId] = useState<string | "all">("all")

  const setSelectedProject = useCallback((projectId: string | "all") => {
    setSelectedProjectId(projectId)
  }, [])

  const clearFilters = useCallback(() => {
    setSelectedProjectId("all")
  }, [])

  return {
    selectedProjectId,
    setSelectedProject,
    clearFilters,
  }
}
