# Feature Builder API

Parallel research system for feature planning and architecture design. Spawns 4 concurrent research agents to analyze different aspects of a feature request.

## Overview

The Feature Builder uses a GSD-inspired parallel research approach:
- **4 concurrent agents** research different aspects simultaneously
- **Real-time progress tracking** via status endpoint
- **Automatic synthesis** combines all findings into an implementation plan
- **Timeout handling** ensures research doesn't hang indefinitely

## Endpoints

### POST /api/feature-builder/research

Start a new parallel research session.

**Request Body:**
```json
{
  "context": "Description of the feature to research",
  "projectId": "optional-project-uuid",
  "timeoutSeconds": 300,
  "model": "moonshot/kimi-for-coding"
}
```

**Response:**
```json
{
  "researchId": "uuid",
  "status": "running",
  "agents": [
    { "id": "stack", "name": "Stack Researcher", "focus": "technology stack", "status": "running" },
    { "id": "features", "name": "Feature Analyst", "focus": "feature requirements", "status": "running" },
    { "id": "architecture", "name": "Architecture Designer", "focus": "system architecture", "status": "running" },
    { "id": "pitfalls", "name": "Risk Analyst", "focus": "risks and pitfalls", "status": "running" }
  ],
  "startedAt": 1234567890,
  "timeoutAt": 1234570890
}
```

### GET /api/feature-builder/research?researchId={id}

Get the status and results of a research session.

**Response (in-progress):**
```json
{
  "researchId": "uuid",
  "status": "running",
  "agents": [...],
  "startedAt": 1234567890
}
```

**Response (completed):**
```json
{
  "researchId": "uuid",
  "status": "completed",
  "agents": [
    {
      "id": "stack",
      "name": "Stack Researcher",
      "status": "completed",
      "result": "# Technology Stack Report...",
      "startedAt": 1234567890,
      "completedAt": 1234569999
    }
  ],
  "synthesis": "# Research Synthesis...",
  "startedAt": 1234567890,
  "completedAt": 1234570000
}
```

## Research Agents

### Stack Researcher
Recommends optimal technology stack:
- Frontend frameworks and libraries
- Backend runtime and database
- Infrastructure and CI/CD
- Third-party services

### Feature Analyst
Breaks down requirements:
- Core features and user stories
- Acceptance criteria
- Nice-to-haves and edge cases

### Architecture Designer
Designs system structure:
- Component overview and data flow
- API design
- State management approach
- Integration points

### Risk Analyst
Identifies potential issues:
- Technical risks and scalability concerns
- Implementation challenges
- User experience pitfalls
- Mitigation strategies

## Agent Statuses

- `pending` - Agent is starting up
- `running` - Agent is actively researching
- `completed` - Agent finished successfully
- `failed` - Agent encountered an error
- `timeout` - Agent didn't complete in time

## Synthesis

When all agents complete (or timeout), the system automatically synthesizes their findings into:
- Executive summary
- Key findings by area
- Unified implementation approach
- Phased roadmap
- Critical decisions needed
- Open questions

## Example Usage

```typescript
// Start research
const response = await fetch('/api/feature-builder/research', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    context: "Build a real-time collaborative code editor with syntax highlighting, cursor presence, and version history. Target: 1000 concurrent users.",
    projectId: "my-project-uuid",
    timeoutSeconds: 300
  })
})

const { researchId } = await response.json()

// Poll for results
const poll = setInterval(async () => {
  const status = await fetch(`/api/feature-builder/research?researchId=${researchId}`)
  const data = await status.json()
  
  if (data.status === 'completed' || data.status === 'failed') {
    clearInterval(poll)
    console.log(data.synthesis)
  }
}, 5000)
```

## Configuration

- **Default timeout**: 300 seconds (5 minutes)
- **Default model**: `moonshot/kimi-for-coding` (fast, good for research)
- **Synthesis timeout**: 120 seconds (2 minutes)

## Notes

- Research sessions are stored in-memory and will be lost on server restart
- Each agent runs in its own isolated session
- The synthesis agent only runs after all research agents complete
- Failed or timed-out agents don't block synthesis - partial results are used
