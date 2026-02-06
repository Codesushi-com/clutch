'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TimeRange } from '../types'

interface FilterBarProps {
  roles: string[]
  models: string[]
  selectedRole: string
  selectedModel: string
  selectedTimeRange: TimeRange
  onRoleChange: (role: string) => void
  onModelChange: (model: string) => void
  onTimeRangeChange: (range: TimeRange) => void
}

export function FilterBar({
  roles,
  models,
  selectedRole,
  selectedModel,
  selectedTimeRange,
  onRoleChange,
  onModelChange,
  onTimeRangeChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Role filter */}
      <div>
        <Select value={selectedRole} onValueChange={onRoleChange}>
          <SelectTrigger>
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {roles.map((role) => (
              <SelectItem key={role} value={role}>
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Model filter */}
      <div>
        <Select value={selectedModel} onValueChange={onModelChange}>
          <SelectTrigger>
            <SelectValue placeholder="All Models" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Models</SelectItem>
            {models.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Time range */}
      <div>
        <Select value={selectedTimeRange} onValueChange={(v) => onTimeRangeChange(v as TimeRange)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
