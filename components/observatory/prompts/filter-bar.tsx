'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface FilterBarProps {
  roles: string[]
  models: string[]
  selectedRole: string
  selectedModel: string
  onRoleChange: (role: string) => void
  onModelChange: (model: string) => void
}

export function FilterBar({
  roles,
  models,
  selectedRole,
  selectedModel,
  onRoleChange,
  onModelChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Role filter */}
      <Select value={selectedRole} onValueChange={onRoleChange}>
        <SelectTrigger className="w-[120px]" size="sm">
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

      {/* Model filter */}
      <Select value={selectedModel} onValueChange={onModelChange}>
        <SelectTrigger className="w-[140px]" size="sm">
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
  )
}
