# Prompt Template System

The OpenClutch prompt system uses Handlebars templates stored in the database (Convex `promptVersions` table) to generate role-specific prompts for sub-agents.

## Overview

- **Single Source of Truth**: All prompts are stored in Convex `promptVersions`
- **Template Engine**: Handlebars for variable substitution and conditionals
- **Caching**: Compiled templates are cached for performance
- **A/B Testing**: Built-in support for prompt variants via `ab_test` flag

## Available Roles

| Role | Description | Special Variables |
|------|-------------|-------------------|
| `dev` | Developer - implements features/fixes | `branchName`, `worktreeDir` |
| `reviewer` | Code reviewer - reviews PRs | `prNumber`, `branchName`, `worktreeDir` |
| `conflict_resolver` | Resolves merge conflicts | `prNumber`, `branchName`, `worktreeDir` |
| `pm` | Product manager - triage & analysis | `imageUrls`, `signalResponses` |
| `research` | Research agent - investigates topics | (common variables only) |

## Template Syntax

### Variable Substitution

```handlebars
## Task: {{taskTitle}}

Ticket ID: {{taskId}}
Project: {{projectSlug}}
```

### Conditionals

```handlebars
{{#if hasComments}}
### Comments:
{{#each comments}}
- [{{timestamp}}] {{author}}: {{content}}
{{/each}}
{{/if}}
```

### Loops

```handlebars
{{#each imageUrls}}
- Image {{@index}}: {{this}}
{{/each}}
```

### Using @index in Loops

```handlebars
{{#each items}}
{{@index}}. {{this}}
{{/each}}
```

## Common Variables

Available to all roles:

| Variable | Type | Description |
|----------|------|-------------|
| `taskId` | string | Unique task identifier |
| `taskTitle` | string | Task title |
| `taskDescription` | string | Task description markdown |
| `projectSlug` | string | Project slug for CLI commands |
| `repoDir` | string | Repository directory path |
| `comments` | array | Task comments from previous work |
| `hasComments` | boolean | Whether comments exist |

## Role-Specific Variables

### Dev Role

```handlebars
Branch: {{branchName}}
Worktree: {{worktreeDir}}
```

### Reviewer Role

```handlebars
{{#if hasPrNumber}}
PR: #{{prNumber}}
{{else}}
PR: Not set
{{/if}}
Worktree: {{worktreeDir}}
Branch: {{branchName}}
```

### PM Role

```handlebars
{{#if hasImages}}
### Attached Images:
{{#each imageUrls}}
- {{this}}
{{/each}}
{{/if}}

{{#if hasSignalResponses}}
### Previous Q&A:
{{#each signalResponses}}
**Q:** {{question}}
**A:** {{response}}
{{/each}}
{{/if}}
```

## Managing Prompts

### Seeding Initial Prompts

```bash
# Seed default prompts for all roles
curl -X POST http://localhost:3002/api/prompts/seed
```

### Creating a New Prompt Version

1. Go to the Observatory dashboard
2. Navigate to the **Prompts** tab
3. Select the role and click **New Version**
4. Edit the template using Handlebars syntax
5. Set change summary and activate

### A/B Testing

To run an A/B test:

1. Create a new prompt version with changes
2. Enable the **A/B Test** toggle
3. Set traffic split (e.g., 50% control, 50% challenger)
4. Monitor metrics in the Prompts tab

The system automatically assigns agents to variants based on the configured split.

## Validation

Templates are validated for:

- **Syntax errors**: Mismatched braces, unclosed blocks
- **Undefined variables**: Variables not in the role's schema

Validation happens automatically when saving a new prompt version.

### Example Validation Errors

```
❌ Syntax Error: Unclosed blocks: each
❌ Undefined Variables: foo, bar
```

## Performance

- Templates are compiled once and cached
- Cache key is derived from template content
- Cache stats available via `getTemplateCacheStats()`

## Migration from Legacy System

The legacy hardcoded prompt builders have been removed. All prompts now use the template system:

- ✅ `buildPrompt()` - Removed (was synchronous, hardcoded)
- ✅ `build*TaskContext()` - Removed (per-role hardcoded context)
- ✅ `PROMPT_TEMPLATE_ENGINE` flag - Removed (templates are the only path)

## Troubleshooting

### "No active prompt version found for role"

Run the seed endpoint to initialize default prompts:

```bash
curl -X POST http://localhost:3002/api/prompts/seed
```

### Template rendering errors

Check the worker logs for:
- Syntax errors in the template
- Undefined variable references
- Missing helper functions

### Cache issues

To clear the template cache (rarely needed):

```typescript
import { clearTemplateCache } from "./worker/template-engine"
clearTemplateCache()
```
