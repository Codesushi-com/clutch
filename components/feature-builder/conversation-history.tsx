'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageSquare, User, Bot, Edit2 } from 'lucide-react'
import type { ConversationMessage, Answer } from './types'

interface ConversationHistoryProps {
  messages: ConversationMessage[]
  answers: Answer[]
  onEditAnswer?: (questionId: string) => void
  className?: string
}

export function ConversationHistory({
  messages,
  answers,
  onEditAnswer,
  className,
}: ConversationHistoryProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const getAnswerForQuestion = (questionId: string) => {
    return answers.find((a) => a.questionId === questionId)
  }

  return (
    <div className={cn('flex h-full flex-col bg-secondary/30', className)}>
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-card-foreground">
            Conversation
          </h3>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 px-4 py-4">
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {messages.map((message, index) => {
              const isQuestion = message.type === 'question'
              const answer = isQuestion
                ? getAnswerForQuestion(message.id)
                : null
              const canEdit = answer && onEditAnswer

              return (
                <motion.div
                  key={`${message.id}-${index}`}
                  initial={{ opacity: 0, x: isQuestion ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{
                    duration: 0.3,
                    delay: index * 0.05,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                  layout
                  className={cn(
                    'flex gap-3',
                    isQuestion ? 'flex-row' : 'flex-row-reverse'
                  )}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      isQuestion
                        ? 'bg-primary/10 text-primary'
                        : 'bg-accent text-accent-foreground'
                    )}
                  >
                    {isQuestion ? (
                      <Bot className="h-4 w-4" />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </div>

                  {/* Message bubble */}
                  <div
                    className={cn(
                      'group relative max-w-[85%] rounded-2xl px-4 py-3',
                      isQuestion
                        ? 'bg-card text-card-foreground'
                        : 'bg-primary text-primary-foreground'
                    )}
                  >
                    <p className="text-sm leading-relaxed">{message.content}</p>

                    {/* Options display for answers */}
                    {message.options && message.options.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {message.options.map((option, i) => (
                          <span
                            key={i}
                            className={cn(
                              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                              isQuestion
                                ? 'bg-secondary text-secondary-foreground'
                                : 'bg-primary-foreground/20 text-primary-foreground'
                            )}
                          >
                            {option}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Edit button for answers */}
                    {canEdit && (
                      <motion.button
                        initial={{ opacity: 0 }}
                        whileHover={{ opacity: 1 }}
                        className={cn(
                          'absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full',
                          'bg-accent text-accent-foreground shadow-sm',
                          'opacity-0 transition-opacity group-hover:opacity-100',
                          'hover:bg-accent/80'
                        )}
                        onClick={() => onEditAnswer?.(message.id)}
                        title="Edit answer"
                      >
                        <Edit2 className="h-3 w-3" />
                      </motion.button>
                    )}

                    {/* Timestamp */}
                    <span
                      className={cn(
                        'mt-1 block text-[10px] opacity-60',
                        isQuestion
                          ? 'text-muted-foreground'
                          : 'text-primary-foreground/70'
                      )}
                    >
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {/* Empty state */}
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-8 text-center"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Your conversation will appear here
              </p>
            </motion.div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
