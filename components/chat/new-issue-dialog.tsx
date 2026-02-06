"use client"

import { useState, useRef, useEffect } from "react"
import { X, Send, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { TaskPriority } from "@/lib/types"

interface NewIssueDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (taskId: string) => void
}

interface Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
}

interface TriageState {
  step: "initial" | "clarifying" | "finalizing" | "creating" | "complete"
  title?: string
  description?: string
  priority?: TaskPriority
  acceptanceCriteria?: string[]
  dependencies?: string[]
  suggestedFiles?: string[]
}

const PRIORITIES: { value: TaskPriority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "#52525b" },
  { value: "medium", label: "Medium", color: "#3b82f6" },
  { value: "high", label: "High", color: "#f97316" },
  { value: "urgent", label: "Urgent", color: "#ef4444" },
]

export function NewIssueDialog({
  projectId,
  open,
  onOpenChange,
  onCreated,
}: NewIssueDialogProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [triageState, setTriageState] = useState<TriageState>({ step: "initial" })
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Initialize dialog when opened
  useEffect(() => {
    if (open && messages.length === 0) {
      const welcomeMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Hi! I'll help you create a new issue. What would you like to build or fix?",
        timestamp: Date.now(),
      }
      setMessages([welcomeMessage])
      setTriageState({ step: "initial" })
      
      // Focus input when opened
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [open, messages.length])

  // Reset dialog when closed
  useEffect(() => {
    if (!open) {
      setMessages([])
      setInput("")
      setTriageState({ step: "initial" })
    }
  }, [open])

  const addMessage = (role: "user" | "assistant" | "system", content: string) => {
    const message: Message = {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, message])
    return message
  }

  const analyzeUserInput = (userInput: string): Partial<TriageState> => {
    const input = userInput.toLowerCase()
    
    // Try to extract title (first sentence or line)
    const title = userInput.split(/[.\n]/)[0].trim().slice(0, 100)
    
    // Detect priority keywords
    let priority: TaskPriority = "medium"
    if (input.includes("urgent") || input.includes("critical") || input.includes("asap")) {
      priority = "urgent"
    } else if (input.includes("high") || input.includes("important") || input.includes("soon")) {
      priority = "high"
    } else if (input.includes("low") || input.includes("minor") || input.includes("someday")) {
      priority = "low"
    }

    // Check if the request is clear enough to skip triage
    const isClearRequest = (
      (input.includes("add") || input.includes("create") || input.includes("build")) &&
      (input.includes("button") || input.includes("page") || input.includes("feature") || input.includes("component")) &&
      userInput.length > 10
    ) || (
      (input.includes("fix") || input.includes("bug") || input.includes("error") || input.includes("broken")) &&
      userInput.length > 15
    )

    return {
      title,
      priority,
      description: userInput,
      step: isClearRequest ? "finalizing" : "clarifying"
    }
  }

  const generateClarifyingQuestions = (state: TriageState): string => {
    const questions = []

    if (!state.title || state.title.length < 10) {
      questions.push("• Can you provide a more specific title for this issue?")
    }

    if (!state.description || state.description.length < 20) {
      questions.push("• Can you provide more details about what needs to be done?")
    }

    if (!state.acceptanceCriteria) {
      questions.push("• What would success look like? (acceptance criteria)")
    }

    const userInput = state.description?.toLowerCase() || ""
    if ((userInput.includes("fix") || userInput.includes("bug")) && !userInput.includes("reproduce")) {
      questions.push("• How can someone reproduce this issue?")
    }

    if ((userInput.includes("add") || userInput.includes("create")) && !userInput.includes("where")) {
      questions.push("• Where should this be implemented? (which page/component)")
    }

    if (!state.dependencies) {
      questions.push("• Are there any dependencies or blockers I should know about?")
    }

    if (questions.length === 0) {
      return "Great! Let me prepare this issue for you."
    }

    return `I'd like to ask a few questions to make sure we capture everything:\n\n${questions.join("\n")}\n\nFeel free to answer any or all of these, or just say "that's enough" if you're ready to create the issue.`
  }

  const generateFinalSummary = (state: TriageState): string => {
    const priority = PRIORITIES.find(p => p.value === state.priority)?.label || "Medium"

    let summary = `Perfect! Here's what I'll create:\n\n`
    summary += `**Title:** ${state.title}\n\n`
    summary += `**Priority:** ${priority}\n\n`
    summary += `**Description:**\n${state.description}\n\n`

    if (state.acceptanceCriteria && state.acceptanceCriteria.length > 0) {
      summary += `**Acceptance Criteria:**\n${state.acceptanceCriteria.map(c => `• ${c}`).join("\n")}\n\n`
    }

    if (state.dependencies && state.dependencies.length > 0) {
      summary += `**Dependencies:**\n${state.dependencies.map(d => `• ${d}`).join("\n")}\n\n`
    }

    if (state.suggestedFiles && state.suggestedFiles.length > 0) {
      summary += `**Files likely to be modified:**\n${state.suggestedFiles.map(f => `• ${f}`).join("\n")}\n\n`
    }

    summary += `Ready to create this issue?`

    return summary
  }

  const processAIResponse = (userInput: string, currentState: TriageState) => {
    setSending(true)
    
    // Simulate AI processing delay
    setTimeout(() => {
      const analysis = analyzeUserInput(userInput)
      const newState: TriageState = { ...currentState, ...analysis }

      let aiResponse: string

      switch (newState.step) {
        case "clarifying":
          aiResponse = generateClarifyingQuestions(newState)
          break
        
        case "finalizing":
          aiResponse = generateFinalSummary(newState)
          break
          
        default:
          aiResponse = "I understand. Let me help you create this issue."
      }

      addMessage("assistant", aiResponse)
      setTriageState(newState)
      setSending(false)
    }, 500 + Math.random() * 1000) // Simulate AI thinking time
  }

  const createTask = async () => {
    setTriageState(prev => ({ ...prev, step: "creating" }))
    
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          title: triageState.title,
          description: triageState.description,
          priority: triageState.priority || "medium",
          status: "ready", // Add to Ready queue as specified
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create task")
      }

      const data = await response.json()
      const taskId = data.task.id
      
      setTriageState(prev => ({ ...prev, step: "complete" }))
      addMessage("system", `✅ Issue created successfully! (ID: ${taskId.substring(0, 8)}...)`)
      
      if (onCreated) {
        onCreated(taskId)
      }

      // Auto-close after a delay
      setTimeout(() => {
        onOpenChange(false)
      }, 2000)
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create task"
      addMessage("system", `❌ ${errorMessage}`)
      setTriageState(prev => ({ ...prev, step: "finalizing" }))
    }
  }

  const handleSend = () => {
    if (!input.trim() || sending) return

    const userMessage = input.trim()
    setInput("")
    addMessage("user", userMessage)

    if (triageState.step === "finalizing" && userMessage.toLowerCase().includes("yes")) {
      createTask()
      return
    }

    if (userMessage.toLowerCase().includes("that's enough") || 
        userMessage.toLowerCase().includes("create it") ||
        userMessage.toLowerCase().includes("sounds good")) {
      setTriageState(prev => ({ ...prev, step: "finalizing" }))
      addMessage("assistant", generateFinalSummary(triageState))
      return
    }

    processAIResponse(userMessage, triageState)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      
      {/* Modal */}
      <div className="relative bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl w-full max-w-2xl h-[80vh] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-[var(--accent-blue)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Create New Issue
            </h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "bg-[var(--accent-blue)] text-white"
                    : message.role === "system" 
                    ? "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-center"
                    : "bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)]"
                }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
              </div>
            </div>
          ))}
          
          {sending && (
            <div className="flex justify-start">
              <div className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce"></div>
                  </div>
                  <span className="text-sm text-[var(--text-muted)]">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
        {/* Input */}
        {triageState.step !== "complete" && (
          <div className="border-t border-[var(--border)] p-4">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  triageState.step === "finalizing" 
                    ? "Type 'yes' to create the issue, or provide more details..."
                    : "Type your response..."
                }
                rows={1}
                className="flex-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)] resize-none"
                style={{
                  minHeight: "40px",
                  maxHeight: "120px",
                  height: "auto",
                }}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || sending || triageState.step === "creating"}
                size="sm"
                className="px-3"
              >
                {triageState.step === "creating" ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            {triageState.step === "finalizing" && (
              <div className="mt-2 flex gap-2">
                <Button
                  onClick={createTask}
                  disabled={sending}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  ✓ Create Issue
                </Button>
                <Button
                  onClick={() => {
                    addMessage("assistant", "No problem! What would you like to adjust?")
                    setTriageState(prev => ({ ...prev, step: "clarifying" }))
                  }}
                  variant="outline"
                  size="sm"
                >
                  Make Changes
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}