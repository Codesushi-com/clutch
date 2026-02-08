'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ArrowRight, ArrowLeft, Sparkles } from 'lucide-react'
import { OptionCard } from './option-card'
import { CustomInput } from './custom-input'
import type { Question, Answer } from './types'

interface QuestionCardProps {
  question: Question
  answer?: Answer
  onAnswer: (answer: Omit<Answer, 'answeredAt'>) => void
  onPrevious?: () => void
  canGoBack: boolean
  isLast: boolean
}

export function QuestionCard({
  question,
  answer,
  onAnswer,
  onPrevious,
  canGoBack,
  isLast,
}: QuestionCardProps) {
  const [selectedOptions, setSelectedOptions] = React.useState<string[]>(
    answer?.selectedOptions || []
  )
  const [customValue, setCustomValue] = React.useState(
    answer?.customValue || ''
  )
  const [isCustomActive, setIsCustomActive] = React.useState(false)

  // Reset state when question changes
  React.useEffect(() => {
    setSelectedOptions(answer?.selectedOptions || [])
    setCustomValue(answer?.customValue || '')
    setIsCustomActive(false)
  }, [question.id, answer])

  const isMultiSelect = question.type === 'multiple'
  const hasSelection = selectedOptions.length > 0 || customValue.trim().length > 0

  const handleOptionClick = (optionId: string) => {
    if (isMultiSelect) {
      setSelectedOptions((prev) =>
        prev.includes(optionId)
          ? prev.filter((id) => id !== optionId)
          : [...prev, optionId]
      )
    } else {
      setSelectedOptions([optionId])
      // Auto-advance for single select
      setTimeout(() => {
        onAnswer({
          questionId: question.id,
          selectedOptions: [optionId],
        })
      }, 300)
    }
  }

  const handleCustomSubmit = () => {
    if (customValue.trim()) {
      if (isMultiSelect) {
        setSelectedOptions((prev) => [...prev, `custom:${customValue.trim()}`])
        setCustomValue('')
        setIsCustomActive(false)
      } else {
        onAnswer({
          questionId: question.id,
          selectedOptions: [`custom:${customValue.trim()}`],
          customValue: customValue.trim(),
        })
      }
    }
  }

  const handleContinue = () => {
    if (hasSelection) {
      onAnswer({
        questionId: question.id,
        selectedOptions,
        customValue: customValue.trim() || undefined,
      })
    }
  }

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-full"
    >
      {/* Question header */}
      <div className="mb-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-3 flex items-center gap-2"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-medium text-muted-foreground">
            Let&apos;s build your feature
          </span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-2xl font-semibold tracking-tight text-foreground"
        >
          {question.question}
        </motion.h2>

        {question.description && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-2 text-base text-muted-foreground"
          >
            {question.description}
          </motion.p>
        )}
      </div>

      {/* Options */}
      <div className="space-y-3">
        {question.options?.map((option, index) => (
          <OptionCard
            key={option.id}
            option={option}
            isSelected={selectedOptions.includes(option.id)}
            isMulti={isMultiSelect}
            onClick={() => handleOptionClick(option.id)}
            index={index}
          />
        ))}

        {/* Custom input */}
        {question.allowCustom && (
          <CustomInput
            value={customValue}
            onChange={setCustomValue}
            onSubmit={handleCustomSubmit}
            onCancel={() => {
              setIsCustomActive(false)
              setCustomValue('')
            }}
            placeholder={question.customPlaceholder}
            isActive={isCustomActive}
            onActivate={() => setIsCustomActive(true)}
          />
        )}
      </div>

      {/* Navigation */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-8 flex items-center justify-between"
      >
        <Button
          variant="ghost"
          onClick={onPrevious}
          disabled={!canGoBack}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {isMultiSelect && (
          <Button
            onClick={handleContinue}
            disabled={!hasSelection}
            className="gap-2"
          >
            {isLast ? 'Finish' : 'Continue'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </motion.div>
    </motion.div>
  )
}
