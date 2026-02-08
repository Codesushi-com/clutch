import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { getGatewayClient } from "../../../../worker/gateway-client"

// ============================================
// Types
// ============================================

export interface ResearchRequest {
  /** Feature description or conversation context */
  context: string
  /** Optional project ID to associate with research */
  projectId?: string
  /** Optional timeout in seconds (default: 300 = 5 minutes) */
  timeoutSeconds?: number
  /** Optional model override (default: kimi for speed) */
  model?: string
}

export interface ResearchAgent {
  id: string
  name: string
  focus: string
  sessionKey: string
  status: "pending" | "running" | "completed" | "failed" | "timeout"
  result?: string
  error?: string
  startedAt: number
  completedAt?: number
}

export interface ResearchResponse {
  researchId: string
  status: "running" | "completed" | "failed" | "partial"
  agents: ResearchAgent[]
  synthesis?: string
  startedAt: number
  completedAt?: number
}

// ============================================
// Research Configuration
// ============================================

const RESEARCH_AGENTS = [
  {
    id: "stack",
    name: "Stack Researcher",
    focus: "technology stack",
    promptTemplate: (context: string) => `You are a technology stack researcher. Analyze the following feature request and recommend the optimal technology stack.

## Feature Context
${context}

## Your Task
Research and recommend:
1. **Frontend technologies** - frameworks, libraries, UI components
2. **Backend technologies** - APIs, services, databases
3. **Infrastructure** - hosting, CI/CD, monitoring
4. **Third-party services** - auth, payments, analytics, etc.

## Output Format
Provide your findings as a structured report:
\`\`\`markdown
## Recommended Stack

### Frontend
- **Framework**: [name] - [why it's a good fit]
- **UI Library**: [name] - [rationale]

### Backend
- **Runtime**: [name] - [rationale]
- **Database**: [name] - [rationale]

### Infrastructure
- **Hosting**: [name] - [rationale]
- **CI/CD**: [name] - [rationale]

### Third-Party Services
- **[Category]**: [service name] - [rationale]

## Alternatives Considered
Briefly mention alternatives and why they were rejected.
\`\`\`

Be specific with library names and versions. Consider the existing codebase context if available.`,
  },
  {
    id: "features",
    name: "Feature Analyst",
    focus: "feature requirements",
    promptTemplate: (context: string) => `You are a feature requirements analyst. Analyze the following feature request and break down the functional requirements.

## Feature Context
${context}

## Your Task
Analyze and document:
1. **Core features** - what must be built
2. **User stories** - who needs what and why
3. **Acceptance criteria** - how to verify completeness
4. **Nice-to-haves** - features for future iterations
5. **Edge cases** - unusual scenarios to handle

## Output Format
Provide your findings as a structured report:
\`\`\`markdown
## Feature Requirements Analysis

### Core Features
1. **[Feature Name]**
   - Description: [what it does]
   - Priority: [must-have/should-have]
   - Complexity: [low/medium/high]

### User Stories
- As a [user type], I want [goal], so that [benefit]

### Acceptance Criteria
- [ ] [Specific, testable criterion]

### Nice-to-Haves
1. [Feature] - [brief description]

### Edge Cases
- [Scenario]: [how to handle]
\`\`\`

Be thorough but practical. Focus on what delivers value.`,
  },
  {
    id: "architecture",
    name: "Architecture Designer",
    focus: "system architecture",
    promptTemplate: (context: string) => `You are a system architect. Design the high-level architecture for the following feature.

## Feature Context
${context}

## Your Task
Design and document:
1. **System components** - major building blocks
2. **Data flow** - how information moves
3. **API design** - key endpoints/interfaces
4. **State management** - how state is handled
5. **Integration points** - external connections

## Output Format
Provide your findings as a structured report:
\`\`\`markdown
## Architecture Design

### Component Overview
\`\`\`
[Component A] <---> [Component B] <---> [Component C]
     |                                    |
     v                                    v
[Database A]                        [External API]
\`\`\`

### Component Details

#### [Component Name]
- **Responsibility**: [what it does]
- **Key Files**: [expected file paths]
- **Dependencies**: [what it needs]

### Data Flow
1. [Step 1]: [description]
2. [Step 2]: [description]

### API Design
\`\`\`typescript
// Key endpoints or interfaces
interface ExampleAPI {
  method: string
  path: string
  request: RequestType
  response: ResponseType
}
\`\`\`

### State Management
- [Approach]: [rationale]

### Integration Points
- **[Service]**: [how it integrates]
\`\`\`

Keep it practical. Avoid over-engineering.`,
  },
  {
    id: "pitfalls",
    name: "Risk Analyst",
    focus: "risks and pitfalls",
    promptTemplate: (context: string) => `You are a risk analyst and devil's advocate. Identify potential pitfalls, risks, and challenges for implementing the following feature.

## Feature Context
${context}

## Your Task
Identify and analyze:
1. **Technical risks** - scalability, performance, security
2. **Implementation challenges** - complexity, dependencies, unknowns
3. **User experience pitfalls** - confusion, friction, edge cases
4. **Maintenance concerns** - ongoing costs, technical debt
5. **Mitigation strategies** - how to address each risk

## Output Format
Provide your findings as a structured report:
\`\`\`markdown
## Risk Analysis

### High Priority Risks
1. **[Risk Name]** 🔴
   - **Description**: [what could go wrong]
   - **Impact**: [severity if it happens]
   - **Likelihood**: [probability]
   - **Mitigation**: [how to prevent or handle]

### Medium Priority Risks
1. **[Risk Name]** 🟡
   - **Description**: [what could go wrong]
   - **Impact**: [severity]
   - **Mitigation**: [how to address]

### Low Priority Risks
1. **[Risk Name]** 🟢
   - **Description**: [brief description]
   - **Mitigation**: [brief mitigation]

### Implementation Challenges
- **[Challenge]**: [description and potential solutions]

### Questions to Resolve
- [What do we need to know before starting?]
\`\`\`

Be honest about risks but constructive with solutions. Don't be overly alarmist.`,
  },
]

const DEFAULT_TIMEOUT_SECONDS = 300 // 5 minutes
const DEFAULT_MODEL = "moonshot/kimi-for-coding"

// ============================================
// Active Research Sessions (in-memory)
// ============================================

interface ActiveResearch {
  researchId: string
  context: string
  projectId?: string
  agents: Map<string, ResearchAgent>
  startedAt: number
  timeoutAt: number
  model: string
  synthesis?: string
  status: "running" | "completed" | "failed" | "partial"
}

// In-memory storage for active research sessions
// In production, this would be in Redis or a database
const activeResearchSessions = new Map<string, ActiveResearch>()

// ============================================
// Agent Spawning
// ============================================

async function spawnResearchAgent(
  researchId: string,
  agentConfig: typeof RESEARCH_AGENTS[0],
  context: string,
  model: string,
  timeoutSeconds: number
): Promise<ResearchAgent> {
  const gateway = getGatewayClient()
  await gateway.connect()

  const sessionKey = `research:${researchId}:${agentConfig.id}`
  const startedAt = Date.now()

  const agent: ResearchAgent = {
    id: agentConfig.id,
    name: agentConfig.name,
    focus: agentConfig.focus,
    sessionKey,
    status: "running",
    startedAt,
  }

  // Spawn the agent asynchronously
  const prompt = agentConfig.promptTemplate(context)

  gateway
    .runAgent({
      message: prompt,
      sessionKey,
      model,
      thinking: "off",
      timeout: timeoutSeconds,
    })
    .then(async (result) => {
      // Fetch the session result
      try {
        const response = await fetch(`http://localhost:3002/api/sessions/${encodeURIComponent(sessionKey)}/history`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })

        if (response.ok) {
          const history = await response.json()
          // Extract the last assistant message as the result
          const lastMessage = history.messages?.reverse().find((m: { role: string }) => m.role === "assistant")
          agent.result = lastMessage?.content || result.reply || "Research completed but no output captured"
        } else {
          agent.result = result.reply || "Research completed"
        }
        agent.status = "completed"
      } catch {
        agent.status = "completed"
        agent.result = result.reply || "Research completed"
      }
      agent.completedAt = Date.now()
    })
    .catch((error) => {
      agent.status = "failed"
      agent.error = error instanceof Error ? error.message : String(error)
      agent.completedAt = Date.now()
    })

  return agent
}

// ============================================
// Synthesis
// ============================================

async function synthesizeResearch(
  researchId: string,
  context: string,
  agents: ResearchAgent[],
  model: string
): Promise<string> {
  const gateway = getGatewayClient()
  await gateway.connect()

  const sessionKey = `research:${researchId}:synthesis`

  // Build synthesis prompt
  const completedAgents = agents.filter((a) => a.status === "completed" && a.result)
  const failedAgents = agents.filter((a) => a.status === "failed" || a.status === "timeout")

  const synthesisPrompt = `You are a research synthesis expert. Combine the findings from multiple research agents into a coherent implementation plan.

## Original Feature Request
${context}

## Research Findings

${completedAgents
  .map(
    (a) => `### ${a.name} (${a.focus})
${a.result}`
  )
  .join("\n\n---\n\n")}

${
  failedAgents.length > 0
    ? `## Incomplete Research\nThe following research areas did not complete:\n${failedAgents
        .map((a) => `- ${a.name}: ${a.error || "timeout"}`)
        .join("\n")}`
    : ""
}

## Your Task
Create a comprehensive synthesis that:
1. Summarizes the key findings from each research area
2. Identifies conflicts or gaps between different research areas
3. Proposes a unified approach that balances all concerns
4. Provides a recommended implementation order
5. Highlights critical decisions that need to be made

## Output Format
\`\`\`markdown
## Research Synthesis

### Executive Summary
[2-3 paragraph overview of findings and recommendation]

### Key Findings by Area

#### Technology Stack
[Summary of stack recommendations]

#### Feature Requirements
[Summary of what needs to be built]

#### Architecture
[Summary of proposed structure]

#### Risks & Mitigations
[Summary of key risks and how to address them]

### Unified Approach
[How to combine all findings into a coherent plan]

### Implementation Roadmap
1. **Phase 1**: [what to build first]
2. **Phase 2**: [what comes next]
3. **Phase 3**: [future iterations]

### Critical Decisions
- [Decision needed]: [options and recommendation]

### Open Questions
- [What still needs to be clarified?]
\`\`\``

  try {
    await gateway.runAgent({
      message: synthesisPrompt,
      sessionKey,
      model,
      thinking: "off",
      timeout: 120, // 2 minutes for synthesis
    })

    // Fetch the synthesis result
    const response = await fetch(`http://localhost:3002/api/sessions/${encodeURIComponent(sessionKey)}/history`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })

    if (response.ok) {
      const history = await response.json()
      const lastMessage = history.messages?.reverse().find((m: { role: string }) => m.role === "assistant")
      return lastMessage?.content || "Synthesis completed"
    }

    return "Synthesis completed"
  } catch (error) {
    return `Synthesis failed: ${error instanceof Error ? error.message : String(error)}`
  }
}

// ============================================
// API Handlers
// ============================================

/**
 * POST /api/feature-builder/research
 * Start a new parallel research session
 */
export async function POST(request: NextRequest) {
  try {
    const body: ResearchRequest = await request.json()

    // Validate request
    if (!body.context || typeof body.context !== "string") {
      return NextResponse.json({ error: "context is required and must be a string" }, { status: 400 })
    }

    const researchId = randomUUID()
    const startedAt = Date.now()
    const timeoutSeconds = body.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS
    const model = body.model ?? DEFAULT_MODEL
    const timeoutAt = startedAt + timeoutSeconds * 1000

    // Create research session
    const research: ActiveResearch = {
      researchId,
      context: body.context,
      projectId: body.projectId,
      agents: new Map(),
      startedAt,
      timeoutAt,
      model,
      status: "running",
    }

    // Spawn all 4 research agents concurrently
    const spawnPromises = RESEARCH_AGENTS.map(async (agentConfig) => {
      const agent = await spawnResearchAgent(researchId, agentConfig, body.context, model, timeoutSeconds)
      research.agents.set(agentConfig.id, agent)
      return agent
    })

    await Promise.all(spawnPromises)

    // Store the research session
    activeResearchSessions.set(researchId, research)

    // Return initial response
    return NextResponse.json({
      researchId,
      status: "running",
      agents: Array.from(research.agents.values()).map((a) => ({
        id: a.id,
        name: a.name,
        focus: a.focus,
        status: a.status,
        startedAt: a.startedAt,
      })),
      startedAt,
      timeoutAt,
    })
  } catch (error) {
    console.error("[research] Failed to start research:", error)
    return NextResponse.json(
      { error: "Failed to start research", details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * GET /api/feature-builder/research?researchId=xxx
 * Get the status and results of a research session
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const researchId = searchParams.get("researchId")

    if (!researchId) {
      return NextResponse.json({ error: "researchId parameter is required" }, { status: 400 })
    }

    const research = activeResearchSessions.get(researchId)
    if (!research) {
      return NextResponse.json({ error: "Research session not found" }, { status: 404 })
    }

    // Check for timeouts
    const now = Date.now()
    const isTimedOut = now > research.timeoutAt

    // Update agent statuses if timed out
    if (isTimedOut && research.status === "running") {
      for (const agent of research.agents.values()) {
        if (agent.status === "running") {
          agent.status = "timeout"
          agent.error = "Research timed out"
          agent.completedAt = now
        }
      }
    }

    // Check if all agents are done
    const allDone = Array.from(research.agents.values()).every(
      (a) => a.status === "completed" || a.status === "failed" || a.status === "timeout"
    )

    // Auto-synthesize when all agents are done (if not already synthesized)
    if (allDone && !research.synthesis && research.status === "running") {
      research.status = "completed"
      research.synthesis = await synthesizeResearch(
        researchId,
        research.context,
        Array.from(research.agents.values()),
        research.model
      )
    }

    // Build response
    const response: ResearchResponse = {
      researchId: research.researchId,
      status: research.status,
      agents: Array.from(research.agents.values()).map((a) => ({
        id: a.id,
        name: a.name,
        focus: a.focus,
        sessionKey: a.sessionKey,
        status: a.status,
        result: a.result,
        error: a.error,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
      })),
      synthesis: research.synthesis,
      startedAt: research.startedAt,
      completedAt: allDone ? now : undefined,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("[research] Failed to get research status:", error)
    return NextResponse.json(
      { error: "Failed to get research status", details: String(error) },
      { status: 500 }
    )
  }
}
