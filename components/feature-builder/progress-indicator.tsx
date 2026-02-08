'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ProgressIndicatorProps {
  currentStep: number
  totalSteps: number
  answers: number
  className?: string
}

export function ProgressIndicator({
  currentStep,
  totalSteps,
  answers,
  className,
}: ProgressIndicatorProps) {
  const progress = Math.min((currentStep / totalSteps) * 100, 100)
  const answeredProgress = Math.min((answers / totalSteps) * 100, 100)

  return (
    <div className={cn('w-full', className)}>
      {/* Progress header */}
      <div className="mb-3 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">
            Question {currentStep + 1}
          </span>
          <span className="text-muted-foreground">of {totalSteps}</span>
        </div>
        <span className="text-muted-foreground">
          {answers} answered
        </span>
      </div>

      {/* Progress bars */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
        {/* Background track */}
        <div className="absolute inset-0 bg-secondary" />

        {/* Answered progress */}
        <motion.div
          className="absolute h-full rounded-full bg-muted-foreground/30"
          initial={{ width: 0 }}
          animate={{ width: `${answeredProgress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />

        {/* Current position indicator */}
        <motion.div
          className="absolute h-full rounded-full bg-gradient-to-r from-primary to-primary/80"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />

        {/* Glow effect on the leading edge */}
        <motion.div
          className="absolute h-full w-8 rounded-full bg-primary/50 blur-sm"
          initial={{ left: 0 }}
          animate={{ left: `calc(${progress}% - 32px)` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ opacity: progress > 0 ? 1 : 0 }}
        />
      </div>

      {/* Step indicators */}
      <div className="mt-4 flex items-center justify-between">
        {Array.from({ length: totalSteps }).map((_, index) => {
          const isCompleted = index < answers
          const isCurrent = index === currentStep

          return (
            <motion.div
              key={index}
              className={cn(
                'relative flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all duration-300',
                isCompleted
                  ? 'bg-primary text-primary-foreground'
                  : isCurrent
                    ? 'bg-primary/20 text-primary ring-2 ring-primary ring-offset-2 ring-offset-background'
                    : 'bg-secondary text-muted-foreground'
              )}
              initial={false}
              animate={{
                scale: isCurrent ? 1.1 : 1,
              }}
              transition={{ duration: 0.2 }}
            >
              {isCompleted ? (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                index + 1
              )}

              {/* Current step pulse */}
              {isCurrent && (
                <motion.span
                  className="absolute inset-0 rounded-full bg-primary/30"
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.5, 0, 0.5],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
