// Types for the Feature Builder questioning UI

export interface QuestionOption {
  id: string
  label: string
  description?: string
  icon?: string
}

export interface Question {
  id: string
  type: 'single' | 'multiple' | 'text'
  question: string
  description?: string
  options?: QuestionOption[]
  allowCustom?: boolean
  customPlaceholder?: string
  required?: boolean
}

export interface Answer {
  questionId: string
  selectedOptions: string[]
  customValue?: string
  answeredAt: number
}

export interface ConversationMessage {
  id: string
  type: 'question' | 'answer'
  content: string
  timestamp: number
  options?: string[]
}

export interface FeatureBuilderState {
  currentQuestionIndex: number
  answers: Answer[]
  isComplete: boolean
  conversationHistory: ConversationMessage[]
}
