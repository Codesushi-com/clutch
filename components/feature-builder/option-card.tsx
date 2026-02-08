'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import type { QuestionOption } from './types'

interface OptionCardProps {
  option: QuestionOption
  isSelected: boolean
  isMulti: boolean
  onClick: () => void
  index: number
}

export function OptionCard({ option, isSelected, onClick, index }: OptionCardProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.08,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      onClick={onClick}
      className={cn(
        'group relative w-full text-left rounded-xl border-2 p-5 transition-all duration-200',
        'hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isSelected
          ? 'border-primary bg-primary/5 shadow-md'
          : 'border-border bg-card hover:border-primary/30 hover:bg-accent'
      )}
    >
      {/* Selection indicator */}
      <div
        className={cn(
          'absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-200',
          isSelected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/30 bg-transparent'
        )}
      >
        <motion.div
          initial={false}
          animate={{ scale: isSelected ? 1 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <Check className="h-3.5 w-3.5" />
        </motion.div>
      </div>

      {/* Icon (if provided) */}
      {option.icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
          <span className="text-lg">{option.icon}</span>
        </div>
      )}

      {/* Label */}
      <h4
        className={cn(
          'pr-8 text-base font-semibold transition-colors',
          isSelected ? 'text-primary' : 'text-card-foreground'
        )}
      >
        {option.label}
      </h4>

      {/* Description */}
      {option.description && (
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          {option.description}
        </p>
      )}

      {/* Hover glow effect */}
      <motion.div
        className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
        style={{ pointerEvents: 'none' }}
      />
    </motion.button>
  )
}
