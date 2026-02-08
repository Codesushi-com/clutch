'use client'

/**
 * ReassignDropdown Component
 * Dropdown for reassigning a blocked task to a different role/model
 */

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { UserCog, Check } from 'lucide-react'

interface ReassignDropdownProps {
  currentRole?: string
  onReassign: (role: string, model?: string) => void
}

const ROLES = [
  { value: 'pm', label: 'Project Manager', description: 'Planning and requirements' },
  { value: 'dev', label: 'Developer', description: 'Implementation and coding' },
  { value: 'research', label: 'Researcher', description: 'Investigation and analysis' },
  { value: 'reviewer', label: 'Reviewer', description: 'Code review and QA' },
] as const

const MODELS: Record<string, { value: string; label: string }[]> = {
  dev: [
    { value: 'moonshot/kimi-for-coding', label: 'Kimi (Coding)' },
    { value: 'anthropic/claude-opus-4-6', label: 'Claude Opus' },
    { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet' },
  ],
  pm: [
    { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet' },
    { value: 'anthropic/claude-opus-4-6', label: 'Claude Opus' },
  ],
  research: [
    { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet' },
    { value: 'anthropic/claude-opus-4-6', label: 'Claude Opus' },
  ],
  reviewer: [
    { value: 'moonshot/kimi-for-coding', label: 'Kimi (Coding)' },
    { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet' },
  ],
}

export function ReassignDropdown({ currentRole, onReassign }: ReassignDropdownProps) {
  const handleRoleSelect = (role: string) => {
    // If no model options for this role, reassign immediately
    if (!MODELS[role] || MODELS[role].length === 0) {
      onReassign(role)
    }
  }

  const handleModelSelect = (role: string, model: string) => {
    onReassign(role, model)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="border-blue-500 text-blue-700 hover:bg-blue-50"
        >
          <UserCog className="h-4 w-4 mr-1" />
          Reassign
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {ROLES.map((role) => {
          const isCurrent = currentRole === role.value
          const hasModels = MODELS[role.value] && MODELS[role.value].length > 0

          if (hasModels) {
            return (
              <DropdownMenuSub key={role.value}>
                <DropdownMenuSubTrigger className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {role.label}
                      {isCurrent && (
                        <Check className="h-3 w-3 inline ml-1 text-green-600" />
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {role.description}
                    </span>
                  </div>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {MODELS[role.value].map((model) => (
                    <DropdownMenuItem
                      key={model.value}
                      onClick={() => handleModelSelect(role.value, model.value)}
                    >
                      {model.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )
          }

          return (
            <DropdownMenuItem
              key={role.value}
              onClick={() => handleRoleSelect(role.value)}
              className="flex flex-col items-start"
            >
              <span className="font-medium">
                {role.label}
                {isCurrent && (
                  <Check className="h-3 w-3 inline ml-1 text-green-600" />
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {role.description}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
