# Agent Roles System

OpenClutch supports specialized agent roles through SOUL templates that define behavior, expertise, and decision-making patterns for ephemeral agents.

## Available Roles

Role templates are stored in `/home/dan/clawd/roles/` and can be injected into agents at spawn time.

| Role | Template | Purpose |
|------|----------|---------|
| **Project Manager** | `pm.md` | Feature breakdown, ticket creation, prioritization |
| **Principal Engineer** | `pe.md` | Technical architecture, code quality, complex implementation |
| **QA Engineer** | `qa.md` | Testing strategy, bug identification, quality validation |
| **Research Specialist** | `researcher.md` | Market research, technical investigation, competitive analysis |

## Usage in OpenClutch

### Role Assignment
When spawning agents, specify role template to inject specialized behavior:

```typescript
// Example: Spawn PM agent for feature breakdown
const pmAgent = await spawnAgent({
  task: "Break down user authentication epic into tickets",
  role: "pm", // Injects /home/dan/clawd/roles/pm.md as SOUL
  context: { epic: epicDetails }
});
```

### Workflow Patterns
Roles work together in coordinated workflows:

```
Epic → PM Agent (breakdown) → PE Agent (architecture) → Dev Agent (implementation) → QA Agent (validation)
```

### Quality Gates
Each role defines specific quality bars that must be met before work progresses:

- **PM**: Clear acceptance criteria, proper scoping, dependencies identified
- **PE**: Technical feasibility validated, architecture documented, standards followed
- **QA**: Acceptance criteria met, cross-browser tested, UX validated
- **Research**: Multiple sources cited, recommendations supported by data

## Integration Points

### Task Routing
OpenClutch can automatically route work to appropriate role agents based on task type:
- Code architecture → PE role
- Feature breakdown → PM role
- Testing requirements → QA role
- Market analysis → Research role

### Escalation Paths
Roles define when to escalate vs. decide independently, enabling autonomous operation within guardrails.

### Deliverable Standards
Consistent output formats across role agents make handoffs predictable and reduce coordination overhead.

## See Also
- Full role documentation: `/home/dan/clawd/roles/README.md`
- Individual role templates: `/home/dan/clawd/roles/*.md`