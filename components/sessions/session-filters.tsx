"use client"

import * as React from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { X, Filter, Calendar, Cpu, Activity } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"

export interface SessionFilters {
  models: string[]
  statuses: string[]
  timeRange: string | null
}

interface SessionFiltersProps {
  onFiltersChange: (filters: SessionFilters) => void
}

const MODEL_OPTIONS = [
  { value: "opus", label: "Claude Opus" },
  { value: "sonnet", label: "Claude Sonnet" },
  { value: "haiku", label: "Claude Haiku" },
  { value: "gpt-4", label: "GPT-4" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
]

const STATUS_OPTIONS = [
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
]

const TIME_RANGE_OPTIONS = [
  { value: "1h", label: "Last Hour" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
]

export default function SessionFiltersComponent({ onFiltersChange }: SessionFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Parse initial filters from URL
  const [filters, setFilters] = React.useState<SessionFilters>(() => {
    const modelsParam = searchParams.get("models")
    const statusesParam = searchParams.get("statuses") 
    const timeRangeParam = searchParams.get("timeRange")

    return {
      models: modelsParam ? modelsParam.split(",") : [],
      statuses: statusesParam ? statusesParam.split(",") : [],
      timeRange: timeRangeParam,
    }
  })

  // Update URL when filters change
  const updateURL = React.useCallback((newFilters: SessionFilters) => {
    const params = new URLSearchParams(searchParams.toString())
    
    if (newFilters.models.length > 0) {
      params.set("models", newFilters.models.join(","))
    } else {
      params.delete("models")
    }

    if (newFilters.statuses.length > 0) {
      params.set("statuses", newFilters.statuses.join(","))
    } else {
      params.delete("statuses")
    }

    if (newFilters.timeRange) {
      params.set("timeRange", newFilters.timeRange)
    } else {
      params.delete("timeRange")
    }

    const newURL = `${pathname}?${params.toString()}`
    router.replace(newURL)
  }, [pathname, router, searchParams])

  // Apply filters and update URL
  const applyFilters = React.useCallback((newFilters: SessionFilters) => {
    setFilters(newFilters)
    updateURL(newFilters)
    onFiltersChange(newFilters)
  }, [updateURL, onFiltersChange])

  // Add/remove model filter
  const toggleModel = (model: string) => {
    const newModels = filters.models.includes(model)
      ? filters.models.filter(m => m !== model)
      : [...filters.models, model]
    
    applyFilters({ ...filters, models: newModels })
  }

  // Add/remove status filter
  const toggleStatus = (status: string) => {
    const newStatuses = filters.statuses.includes(status)
      ? filters.statuses.filter(s => s !== status)
      : [...filters.statuses, status]
    
    applyFilters({ ...filters, statuses: newStatuses })
  }

  // Set time range filter
  const setTimeRange = (timeRange: string) => {
    applyFilters({ ...filters, timeRange })
  }

  // Clear all filters
  const clearAllFilters = () => {
    applyFilters({ models: [], statuses: [], timeRange: null })
  }

  // Get active filter count
  const activeFiltersCount = filters.models.length + filters.statuses.length + (filters.timeRange ? 1 : 0)

  return (
    <div className="space-y-4 p-4 bg-card rounded-lg border">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4" />
          <h3 className="font-medium">Filters</h3>
          {activeFiltersCount > 0 && (
            <Badge variant="secondary">
              {activeFiltersCount} active
            </Badge>
          )}
        </div>
        {activeFiltersCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            Clear all
            <X className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Model Filter */}
        <div className="space-y-2">
          <Label className="flex items-center space-x-1">
            <Cpu className="h-3 w-3" />
            <span>Model</span>
          </Label>
          <Select onValueChange={toggleModel}>
            <SelectTrigger>
              <SelectValue placeholder="Select models..." />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.models.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {filters.models.map((model) => {
                const option = MODEL_OPTIONS.find(o => o.value === model)
                return (
                  <Badge key={model} variant="outline" className="text-xs">
                    {option?.label || model}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 ml-1"
                      onClick={() => toggleModel(model)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                )
              })}
            </div>
          )}
        </div>

        {/* Status Filter */}
        <div className="space-y-2">
          <Label className="flex items-center space-x-1">
            <Activity className="h-3 w-3" />
            <span>Status</span>
          </Label>
          <Select onValueChange={toggleStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Select status..." />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.statuses.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {filters.statuses.map((status) => {
                const option = STATUS_OPTIONS.find(o => o.value === status)
                return (
                  <Badge key={status} variant="outline" className="text-xs">
                    {option?.label || status}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 ml-1"
                      onClick={() => toggleStatus(status)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                )
              })}
            </div>
          )}
        </div>

        {/* Time Range Filter */}
        <div className="space-y-2">
          <Label className="flex items-center space-x-1">
            <Calendar className="h-3 w-3" />
            <span>Time Range</span>
          </Label>
          <Select onValueChange={setTimeRange} value={filters.timeRange || ""}>
            <SelectTrigger>
              <SelectValue placeholder="Select time range..." />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.timeRange && (
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="text-xs">
                {TIME_RANGE_OPTIONS.find(o => o.value === filters.timeRange)?.label || filters.timeRange}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 ml-1"
                  onClick={() => setTimeRange("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}