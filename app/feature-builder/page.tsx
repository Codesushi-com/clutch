'use client'

import * as React from 'react'
import { FeatureBuilder } from '@/components/feature-builder'
import type { Question, Answer } from '@/components/feature-builder'

// Sample questions for demonstration
const sampleQuestions: Question[] = [
  {
    id: 'feature-type',
    type: 'single',
    question: 'What type of feature are you building?',
    description: 'This helps us understand the scope and complexity of your request.',
    options: [
      {
        id: 'ui',
        label: 'UI Component',
        description: 'A new visual element or interface component',
        icon: '🎨',
      },
      {
        id: 'api',
        label: 'API Endpoint',
        description: 'A new backend service or data endpoint',
        icon: '⚡',
      },
      {
        id: 'integration',
        label: 'Integration',
        description: 'Connect with an external service or API',
        icon: '🔗',
      },
      {
        id: 'automation',
        label: 'Automation',
        description: 'Automated workflow or background process',
        icon: '🤖',
      },
    ],
  },
  {
    id: 'priority',
    type: 'single',
    question: 'What\'s the priority level?',
    description: 'How urgent is this feature for your project?',
    options: [
      {
        id: 'low',
        label: 'Low',
        description: 'Nice to have, can wait',
      },
      {
        id: 'medium',
        label: 'Medium',
        description: 'Should be done soon',
      },
      {
        id: 'high',
        label: 'High',
        description: 'Blocking other work',
      },
    ],
  },
  {
    id: 'scope',
    type: 'multiple',
    question: 'What areas will this affect?',
    description: 'Select all that apply.',
    options: [
      {
        id: 'frontend',
        label: 'Frontend',
        description: 'User interface changes',
      },
      {
        id: 'backend',
        label: 'Backend',
        description: 'Server-side logic',
      },
      {
        id: 'database',
        label: 'Database',
        description: 'Schema or data changes',
      },
      {
        id: 'api',
        label: 'API',
        description: 'External or internal APIs',
      },
    ],
    allowCustom: true,
    customPlaceholder: 'Other area...',
  },
  {
    id: 'description',
    type: 'text',
    question: 'Describe your feature in a few words',
    description: 'Keep it concise - you can add details later.',
    allowCustom: true,
    customPlaceholder: 'e.g., "Add dark mode toggle"',
  },
]

export default function FeatureBuilderPage() {
  const handleComplete = (answers: Answer[]) => {
    console.log('Feature specification complete:', answers)
    // Here you would typically submit to your API
    alert('Feature specification complete! Check the console for details.')
  }

  const handleCancel = () => {
    // Navigate back or close modal
    window.history.back()
  }

  return (
    <div className="container mx-auto p-4">
      <FeatureBuilder
        questions={sampleQuestions}
        onComplete={handleComplete}
        onCancel={handleCancel}
      />
    </div>
  )
}
