import { NextRequest, NextResponse } from "next/server"
import { openclawRpc } from "@/lib/openclaw"

// Types for the question engine
interface ConversationMessage {
  role: "user" | "assistant"
  content: string
  selectedOption?: string
}

interface QuestionOption {
  id: string
  label: string
  description?: string
}

interface QuestionResponse {
  question: string
  header: string
  options: QuestionOption[]
  phase: QuestionPhase
  isComplete: boolean
  summary?: FeatureSummary
}

interface FeatureSummary {
  title: string
  description: string
  goals: string[]
  constraints: string[]
  techPreferences: string[]
  edgeCases: string[]
  userTypes: string[]
}

type QuestionPhase = 
  | "goals" 
  | "constraints" 
  | "tech_preferences" 
  | "edge_cases" 
  | "user_types" 
  | "complete"

interface RequestBody {
  featureDescription: string
  conversation?: ConversationMessage[]
  projectId?: string
}

// GSD-style PM Agent Prompt for adaptive questioning
const PM_AGENT_PROMPT = `You are a Product Manager conducting deep discovery for a new feature. Your goal is to understand what the user wants to build through adaptive questioning.

Follow the GSD (Goal-Oriented System Design) questioning style:
1. Follow the thread — each answer opens new threads to explore
2. Challenge vagueness — ask for specifics when terms are unclear
3. Make abstract concrete — ask "what would that actually look like?"
4. Surface assumptions — reveal what's being taken for granted
5. Find edges — probe boundaries and edge cases
6. Reveal motivation — understand WHY this matters

You have 5 question categories to cover. Progress through them adaptively based on what you've learned:

## Question Categories

### 1. Goals (Phase: goals)
- What problem are we solving?
- What does success look like?
- What is the ONE thing that must work?
- What outcome are we driving toward?

### 2. Constraints (Phase: constraints)
- What limitations exist? (budget, timeline, tech)
- What dependencies or blockers?
- What's non-negotiable vs nice-to-have?
- What can we NOT change?

### 3. Tech Preferences (Phase: tech_preferences)
- Any existing stack we must use?
- Preferred languages/frameworks?
- Infrastructure preferences (cloud, self-hosted)?
- Integration requirements?

### 4. Edge Cases (Phase: edge_cases)
- What could go wrong?
- Unusual usage patterns to handle?
- Scale considerations?
- Error handling expectations?

### 5. User Types (Phase: user_types)
- Who are the primary users?
- Different permission levels needed?
- Technical skill of users?
- Accessibility requirements?

## Response Format

Respond with a JSON object containing:

{
  "question": "The specific question text to ask",
  "header": "Short category header (e.g., 'Goals', 'Constraints')",
  "options": [
    { "id": "opt_1", "label": "Option text", "description": "Optional longer description" },
    { "id": "opt_2", "label": "Option text", "description": "Optional longer description" },
    { "id": "opt_3", "label": "Option text" },
    { "id": "opt_4", "label": "Something else...", "description": "Let me describe my own answer" }
  ],
  "phase": "goals|constraints|tech_preferences|edge_cases|user_types|complete",
  "isComplete": false,
  "summary": null
}

When you have gathered enough information across all categories, set isComplete: true and provide a summary:

{
  "isComplete": true,
  "summary": {
    "title": "Short feature title",
    "description": "One-paragraph description",
    "goals": ["goal 1", "goal 2"],
    "constraints": ["constraint 1"],
    "techPreferences": ["preference 1"],
    "edgeCases": ["edge case 1"],
    "userTypes": ["user type 1"]
  }
}

Rules:
- Ask ONE question at a time (not a list)
- Provide 3-4 multiple choice options plus "Something else..."
- Adapt based on previous answers — don't follow a rigid script
- If the user selected "Something else..." previously, incorporate their freeform answer
- Progress naturally between phases based on context gathered
- When isComplete=true, the question and options fields can be empty
- Be conversational but focused — follow threads that matter`;

/**
 * POST /api/feature-builder/question
 * 
 * Generates the next adaptive question for GSD-style feature discovery.
 * Spawns a PM agent via OpenClaw to analyze conversation history and
 * determine the most valuable next question to ask.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: RequestBody = await request.json()
    const { featureDescription, conversation = [], projectId } = body

    // Validate required fields
    if (!featureDescription || typeof featureDescription !== "string") {
      return NextResponse.json(
        { error: "featureDescription is required and must be a string" },
        { status: 400 }
      )
    }

    // Build the PM agent message
    const agentMessage = buildAgentMessage(featureDescription, conversation, projectId)

    // Spawn PM agent via OpenClaw with Kimi model
    const sessionKey = `clutch:feature-builder:${Date.now()}`
    
    try {
      const result = await openclawRpc<{
        sessionKey?: string
        runId?: string
        status?: string
      }>("sessions.spawn", {
        agentId: "pm",
        task: agentMessage,
        sessionKey,
        model: "moonshot/kimi-for-coding",
        timeoutSeconds: 120,
        cleanup: "delete",
      })

      if (!result.runId) {
        throw new Error("Agent spawn did not return a runId")
      }

      // Poll for agent completion with timeout
      const agentResponse = await pollForAgentResponse(sessionKey, result.runId, 60000)
      
      if (!agentResponse) {
        return NextResponse.json(
          { error: "Agent timed out or failed to produce a response" },
          { status: 504 }
        )
      }

      // Parse the agent's JSON response
      const questionData = parseAgentResponse(agentResponse)
      
      return NextResponse.json(questionData)
      
    } catch (spawnError) {
      console.error("[FeatureBuilder] Agent spawn failed:", spawnError)
      
      // Fallback: return a basic first question if agent fails
      const fallbackResponse: QuestionResponse = {
        question: "What do you want to build?",
        header: "Getting Started",
        options: [
          { id: "describe", label: "Let me describe it", description: "I'll explain the feature in my own words" },
          { id: "problem", label: "Solve a specific problem", description: "I have a clear problem to solve" },
          { id: "idea", label: "Explore an idea", description: "I have a concept but need to flesh it out" },
          { id: "iterate", label: "Improve existing feature", description: "Building on something that already exists" },
        ],
        phase: "goals",
        isComplete: false,
      }
      
      return NextResponse.json(fallbackResponse)
    }
    
  } catch (error) {
    console.error("[FeatureBuilder] Error processing request:", error)
    return NextResponse.json(
      { error: "Failed to generate question" },
      { status: 500 }
    )
  }
}

/**
 * Build the message to send to the PM agent
 */
function buildAgentMessage(
  featureDescription: string,
  conversation: ConversationMessage[],
  projectId?: string
): string {
  let message = PM_AGENT_PROMPT

  message += "\n\n## Current Feature Description\n"
  message += featureDescription

  if (projectId) {
    message += `\n\nProject ID: ${projectId}`
  }

  // Add conversation history if present
  if (conversation.length > 0) {
    message += "\n\n## Conversation History\n"
    
    for (const msg of conversation) {
      if (msg.role === "assistant") {
        message += `\n**You asked:** ${msg.content}`
      } else {
        message += `\n**User responded:** ${msg.content}`
        if (msg.selectedOption) {
          message += ` (selected: ${msg.selectedOption})`
        }
      }
    }
    
    message += "\n\n## Your Task\n"
    message += "Based on the conversation history above, determine the next most valuable question to ask. "
    message += "Progress through the phases naturally (goals → constraints → tech_preferences → edge_cases → user_types → complete). "
    message += "If you have gathered sufficient information across all categories, mark as complete with a summary."
  } else {
    message += "\n\n## Your Task\n"
    message += "This is the start of the conversation. Ask an opening question that begins exploring the goals phase. "
    message += "Make it conversational and adaptive based on the feature description provided."
  }

  message += "\n\nRespond ONLY with the JSON object in the format specified above."

  return message
}

/**
 * Poll for agent response with timeout
 */
async function pollForAgentResponse(
  sessionKey: string,
  runId: string,
  timeoutMs: number
): Promise<string | null> {
  const startTime = Date.now()
  const pollInterval = 1000 // 1 second between polls

  while (Date.now() - startTime < timeoutMs) {
    try {
      // Get session preview to check for new messages
      const preview = await openclawRpc<{
        previews?: Array<{
          key: string
          status: string
          items: Array<{
            role: string
            text: string
            model?: string
          }>
        }>
      }>("sessions.preview", {
        keys: [sessionKey],
        limit: 10,
      })

      const sessionPreview = preview.previews?.find(p => p.key === sessionKey)
      
      if (sessionPreview && sessionPreview.items.length > 0) {
        // Find the last assistant message
        const assistantMessages = sessionPreview.items
          .filter(item => item.role === "assistant")
          .map(item => item.text)
        
        if (assistantMessages.length > 0) {
          // Return the most recent assistant message
          return assistantMessages[assistantMessages.length - 1]
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval))
      
    } catch (error) {
      console.warn("[FeatureBuilder] Poll error:", error)
      // Continue polling despite errors
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }
  }

  return null // Timeout reached
}

/**
 * Parse agent response and validate structure
 */
function parseAgentResponse(response: string): QuestionResponse {
  try {
    // Try to extract JSON from the response (agent might wrap it in markdown)
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    const jsonStr = jsonMatch ? jsonMatch[0] : response
    
    const parsed = JSON.parse(jsonStr) as Partial<QuestionResponse>

    // Validate and provide defaults
    const validated: QuestionResponse = {
      question: parsed.question || "What else should we consider?",
      header: parsed.header || "Discovery",
      options: Array.isArray(parsed.options) && parsed.options.length > 0
        ? parsed.options.map((opt, idx) => ({
            id: opt.id || `opt_${idx}`,
            label: opt.label || "Option",
            description: opt.description,
          }))
        : [
            { id: "continue", label: "Continue", description: "Let's keep going" },
            { id: "elaborate", label: "Tell me more", description: "I need more details" },
            { id: "skip", label: "Skip this", description: "Move to next topic" },
            { id: "other", label: "Something else...", description: "None of the above" },
          ],
      phase: validatePhase(parsed.phase),
      isComplete: parsed.isComplete === true,
      summary: parsed.isComplete && parsed.summary
        ? {
            title: parsed.summary.title || "Untitled Feature",
            description: parsed.summary.description || "",
            goals: parsed.summary.goals || [],
            constraints: parsed.summary.constraints || [],
            techPreferences: parsed.summary.techPreferences || [],
            edgeCases: parsed.summary.edgeCases || [],
            userTypes: parsed.summary.userTypes || [],
          }
        : undefined,
    }

    return validated
    
  } catch (error) {
    console.error("[FeatureBuilder] Failed to parse agent response:", error)
    
    // Return a graceful fallback
    return {
      question: "What else would you like to add about this feature?",
      header: "Additional Context",
      options: [
        { id: "more_goals", label: "More about goals", description: "Clarify objectives" },
        { id: "constraints", label: "Constraints", description: "Discuss limitations" },
        { id: "users", label: "User types", description: "Who will use this" },
        { id: "complete", label: "I'm done", description: "Finish the discovery" },
      ],
      phase: "complete",
      isComplete: false,
    }
  }
}

/**
 * Validate question phase
 */
function validatePhase(phase: string | undefined): QuestionPhase {
  const validPhases: QuestionPhase[] = [
    "goals",
    "constraints",
    "tech_preferences",
    "edge_cases",
    "user_types",
    "complete",
  ]
  
  return validPhases.includes(phase as QuestionPhase) 
    ? (phase as QuestionPhase) 
    : "goals"
}