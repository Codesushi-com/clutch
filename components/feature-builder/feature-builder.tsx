'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ProgressIndicator } from './progress-indicator'
import { ConversationHistory } from './conversation-history'
import { QuestionCard } from './question-card'
import type {
  Question,
  Answer,
  ConversationMessage,
  FeatureBuilderState,
} from './types'

interface FeatureBuilderProps {
  questions: Question[]
  onComplete?: (answers: Answer[]) => void
  onCancel?: () => void
  initialAnswers?: Answer[]
  className?: string
}

export function FeatureBuilder({
  questions,
  onComplete,
  onCancel,
  initialAnswers = [],
  className,
}: FeatureBuilderProps) {
  const [state, setState] = React.useState<FeatureBuilderState>({
    currentQuestionIndex: 0,
    answers: initialAnswers,
    isComplete: false,
    conversationHistory: buildInitialHistory(questions, initialAnswers),
  })

  const currentQuestion = questions[state.currentQuestionIndex]
  const currentAnswer = state.answers.find(
    (a) => a.questionId === currentQuestion?.id
  )

  const buildAnswerMessage = (
    question: Question,
    answer: Answer
  ): ConversationMessage => {
    const selectedLabels = answer.selectedOptions
      .map((optId) => {
        if (optId.startsWith('custom:')) {
          return optId.replace('custom:', '')
        }
        return question.options?.find((o) => o.id === optId)?.label || optId
      })
      .filter(Boolean)

    return {
      id: answer.questionId,
      type: 'answer',
      content:
        selectedLabels.length > 0
          ? `I selected: ${selectedLabels.join(', ')}`
          : answer.customValue || 'Skipped',
      timestamp: answer.answeredAt,
      options: selectedLabels,
    }
  }

  function buildInitialHistory(
    questions: Question[],
    answers: Answer[]
  ): ConversationMessage[] {
    const history: ConversationMessage[] = []

    for (const answer of answers) {
      const question = questions.find((q) => q.id === answer.questionId)
      if (question) {
        history.push({
          id: question.id,
          type: 'question',
          content: question.question,
          timestamp: answer.answeredAt - 1000,
        })
        history.push(buildAnswerMessage(question, answer))
      }
    }

    return history
  }

  const handleAnswer = (answerData: Omit<Answer, 'answeredAt'>) => {
    const answer: Answer = {
      ...answerData,
      answeredAt: Date.now(),
    }

    setState((prev) => {
      const existingIndex = prev.answers.findIndex(
        (a) => a.questionId === answer.questionId
      )
      const newAnswers =
        existingIndex >= 0
          ? prev.answers.map((a, i) => (i === existingIndex ? answer : a))
          : [...prev.answers, answer]

      const newHistory = [...prev.conversationHistory]

      // Add question if not already in history
      if (!newHistory.find((h) => h.id === currentQuestion.id && h.type === 'question')) {
        newHistory.push({
          id: currentQuestion.id,
          type: 'question',
          content: currentQuestion.question,
          timestamp: Date.now() - 1000,
        })
      }

      // Add/update answer in history
      const existingAnswerIndex = newHistory.findIndex(
        (h) => h.id === answer.questionId && h.type === 'answer'
      )
      const answerMessage = buildAnswerMessage(currentQuestion, answer)

      if (existingAnswerIndex >= 0) {
        newHistory[existingAnswerIndex] = answerMessage
      } else {
        newHistory.push(answerMessage)
      }

      const isLastQuestion =
        prev.currentQuestionIndex >= questions.length - 1

      if (isLastQuestion) {
        onComplete?.(newAnswers)
      }

      return {
        ...prev,
        answers: newAnswers,
        currentQuestionIndex: isLastQuestion
          ? prev.currentQuestionIndex
          : prev.currentQuestionIndex + 1,
        isComplete: isLastQuestion,
        conversationHistory: newHistory,
      }
    })
  }

  const handleEditAnswer = (questionId: string) => {
    const questionIndex = questions.findIndex((q) => q.id === questionId)
    if (questionIndex >= 0) {
      setState((prev) => ({
        ...prev,
        currentQuestionIndex: questionIndex,
        isComplete: false,
      }))
    }
  }

  const handlePrevious = () => {
    setState((prev) => ({
      ...prev,
      currentQuestionIndex: Math.max(0, prev.currentQuestionIndex - 1),
      isComplete: false,
    }))
  }

  if (!currentQuestion) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <svg
              className="h-8 w-8 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-foreground">
            All questions answered!
          </h3>
          <p className="mt-2 text-muted-foreground">
            Your feature specification is complete.
          </p>
          <Button onClick={onCancel} className="mt-6">
            Done
          </Button>
        </motion.div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex h-[calc(100vh-4rem)] overflow-hidden rounded-lg border bg-background',
        className
      )}
    >
      {/* Left sidebar - Conversation History */}
      <div className="hidden w-80 border-r lg:block">
        <ConversationHistory
          messages={state.conversationHistory}
          answers={state.answers}
          onEditAnswer={handleEditAnswer}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Progress header */}
        <div className="border-b bg-card px-6 py-4">
          <ProgressIndicator
            currentStep={state.currentQuestionIndex}
            totalSteps={questions.length}
            answers={state.answers.length}
          />
        </div>

        {/* Question area */}
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-2xl">
            <AnimatePresence mode="wait">
              <QuestionCard
                key={currentQuestion.id}
                question={currentQuestion}
                answer={currentAnswer}
                onAnswer={handleAnswer}
                onPrevious={handlePrevious}
                canGoBack={state.currentQuestionIndex > 0}
                isLast={state.currentQuestionIndex === questions.length - 1}
              />
            </AnimatePresence>
          </div>
        </div>

        {/* Mobile conversation toggle */}
        <div className="border-t bg-card p-4 lg:hidden">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              // Toggle mobile conversation view
            }}
          >
            View conversation history ({state.answers.length} answered)
          </Button>
        </div>
      </div>
    </div>
  )
}
