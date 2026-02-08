'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Check, X } from 'lucide-react'

interface CustomInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel?: () => void
  placeholder?: string
  isActive: boolean
  onActivate: () => void
}

export function CustomInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder = 'Type your answer...',
  isActive,
  onActivate,
}: CustomInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (isActive && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isActive])

  if (!isActive) {
    return (
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.32 }}
        onClick={onActivate}
        className={cn(
          'group flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/30',
          'bg-card p-5 text-left transition-all duration-200',
          'hover:border-primary/40 hover:bg-accent'
        )}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent group-hover:bg-primary/10">
          <Plus className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
        </div>
        <div>
          <p className="font-medium text-card-foreground">Add custom answer</p>
          <p className="text-sm text-muted-foreground">{placeholder}</p>
        </div>
      </motion.button>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border-2 border-primary bg-primary/5 p-4"
    >
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            onSubmit()
          }
          if (e.key === 'Escape') {
            onCancel?.()
          }
        }}
        placeholder={placeholder}
        className="mb-3 border-0 bg-transparent text-base focus-visible:ring-0 focus-visible:ring-offset-0"
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={!value.trim()}
          className="gap-1.5"
        >
          <Check className="h-4 w-4" />
          Add
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="gap-1.5"
        >
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    </motion.div>
  )
}
