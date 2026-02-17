/**
 * Template Engine Tests
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  renderTemplate,
  renderTemplateSafe,
  validateTemplate,
  getVariableNamesForRole,
  generateVariableSchema,
  registerPromptHelpers,
  ROLE_VARIABLE_SCHEMAS,
  COMMON_VARIABLES,
  DEV_VARIABLES,
  REVIEWER_VARIABLES,
  PM_VARIABLES,
  type CommonTemplateVariables,
  type DevTemplateVariables,
  type ReviewerTemplateVariables,
  type PmTemplateVariables,
} from "../template-engine"

describe("template-engine", () => {
  beforeEach(() => {
    // Re-register helpers before each test
    registerPromptHelpers()
  })

  // ============================================
  // Basic Rendering
  // ============================================

  describe("renderTemplate", () => {
    it("should render simple variable substitution", () => {
      const template = "Hello {{name}}!"
      const result = renderTemplate(template, { name: "World" })
      expect(result).toBe("Hello World!")
    })

    it("should render multiple variables", () => {
      const template = "{{greeting}} {{name}}, you have {{count}} messages."
      const result = renderTemplate(template, { greeting: "Hi", name: "Alice", count: 5 })
      expect(result).toBe("Hi Alice, you have 5 messages.")
    })

    it("should handle undefined variables gracefully", () => {
      const template = "Hello {{name}}!"
      const result = renderTemplate(template, {})
      expect(result).toBe("Hello !")
    })

    it("should render nested object paths", () => {
      const template = "User: {{user.name}}, Email: {{user.email}}"
      const result = renderTemplate(template, {
        user: { name: "John", email: "john@example.com" },
      })
      expect(result).toBe("User: John, Email: john@example.com")
    })

    it("should throw on syntax errors", () => {
      const template = "Hello {{name" // Missing closing braces
      expect(() => renderTemplate(template, { name: "World" })).toThrow()
    })
  })

  describe("renderTemplateSafe", () => {
    it("should return success on valid render", () => {
      const template = "Hello {{name}}!"
      const result = renderTemplateSafe(template, { name: "World" })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.rendered).toBe("Hello World!")
      }
    })

    it("should return failure on syntax error", () => {
      const template = "Hello {{name" // Syntax error
      const result = renderTemplateSafe(template, {})
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain("Parse error")
      }
    })
  })

  // ============================================
  // Conditionals
  // ============================================

  describe("conditionals", () => {
    it("should render if block when condition is true", () => {
      const template = "{{#if showGreeting}}Hello!{{/if}}"
      const result = renderTemplate(template, { showGreeting: true })
      expect(result).toBe("Hello!")
    })

    it("should not render if block when condition is false", () => {
      const template = "{{#if showGreeting}}Hello!{{/if}}"
      const result = renderTemplate(template, { showGreeting: false })
      expect(result).toBe("")
    })

    it("should render else block when condition is false", () => {
      const template = "{{#if showGreeting}}Hello!{{else}}Goodbye!{{/if}}"
      const result = renderTemplate(template, { showGreeting: false })
      expect(result).toBe("Goodbye!")
    })

    it("should handle unless (inverse if)", () => {
      const template = "{{#unless hideGreeting}}Hello!{{/unless}}"
      const result = renderTemplate(template, { hideGreeting: false })
      expect(result).toBe("Hello!")
    })
  })

  // ============================================
  // Loops
  // ============================================

  describe("loops", () => {
    it("should render each block for arrays", () => {
      const template = "Items:{{#each items}} {{this}}{{/each}}"
      const result = renderTemplate(template, { items: ["a", "b", "c"] })
      expect(result).toBe("Items: a b c")
    })

    it("should render each block with object arrays", () => {
      const template = "{{#each users}}{{name}}: {{email}} {{/each}}"
      const result = renderTemplate(template, {
        users: [
          { name: "Alice", email: "alice@example.com" },
          { name: "Bob", email: "bob@example.com" },
        ],
      })
      expect(result).toBe("Alice: alice@example.com Bob: bob@example.com ")
    })

    it("should handle @index in loops", () => {
      const template = "{{#each items}}{{ @index }}: {{this}},{{/each}}"
      const result = renderTemplate(template, { items: ["a", "b"] })
      expect(result).toBe("0: a,1: b,")
    })

    it("should render else block when array is empty", () => {
      const template = "{{#each items}}item{{else}}No items{{/each}}"
      const result = renderTemplate(template, { items: [] })
      expect(result).toBe("No items")
    })
  })

  // ============================================
  // Variable Schema
  // ============================================

  describe("getVariableNamesForRole", () => {
    it("should return common variables for unknown roles", () => {
      const vars = getVariableNamesForRole("unknown_role")
      expect(vars.has("taskId")).toBe(true)
      expect(vars.has("taskTitle")).toBe(true)
      expect(vars.has("taskDescription")).toBe(true)
    })

    it("should return dev variables including branchName and worktreeDir", () => {
      const vars = getVariableNamesForRole("dev")
      expect(vars.has("taskId")).toBe(true)
      expect(vars.has("branchName")).toBe(true)
      expect(vars.has("worktreeDir")).toBe(true)
    })

    it("should return reviewer variables including prNumber", () => {
      const vars = getVariableNamesForRole("reviewer")
      expect(vars.has("taskId")).toBe(true)
      expect(vars.has("prNumber")).toBe(true)
      expect(vars.has("worktreeDir")).toBe(true)
    })

    it("should return pm variables including imageUrls", () => {
      const vars = getVariableNamesForRole("pm")
      expect(vars.has("taskId")).toBe(true)
      expect(vars.has("imageUrls")).toBe(true)
      expect(vars.has("signalResponses")).toBe(true)
    })

    it("should return conflict_resolver variables same as reviewer", () => {
      const vars = getVariableNamesForRole("conflict_resolver")
      expect(vars.has("prNumber")).toBe(true)
      expect(vars.has("branchName")).toBe(true)
    })

    it("should handle researcher alias", () => {
      const vars = getVariableNamesForRole("researcher")
      expect(vars.has("taskId")).toBe(true)
    })
  })

  describe("ROLE_VARIABLE_SCHEMAS", () => {
    it("should have schemas for all required roles", () => {
      expect(ROLE_VARIABLE_SCHEMAS.dev).toBeDefined()
      expect(ROLE_VARIABLE_SCHEMAS.reviewer).toBeDefined()
      expect(ROLE_VARIABLE_SCHEMAS.pm).toBeDefined()
      expect(ROLE_VARIABLE_SCHEMAS.conflict_resolver).toBeDefined()
      expect(ROLE_VARIABLE_SCHEMAS.research).toBeDefined()
    })
  })

  describe("COMMON_VARIABLES", () => {
    it("should have all common variables marked as required", () => {
      const requiredVars = COMMON_VARIABLES.filter((v) => v.required).map((v) => v.name)
      expect(requiredVars).toContain("taskId")
      expect(requiredVars).toContain("taskTitle")
      expect(requiredVars).toContain("taskDescription")
      expect(requiredVars).toContain("projectSlug")
      expect(requiredVars).toContain("repoDir")
    })

    it("should have comments as optional", () => {
      const commentsVar = COMMON_VARIABLES.find((v) => v.name === "comments")
      expect(commentsVar?.required).toBe(false)
    })
  })

  // ============================================
  // Template Validation
  // ============================================

  describe("validateTemplate", () => {
    it("should validate valid template with allowed variables", () => {
      const template = "Task: {{taskTitle}} ({{taskId}})"
      const result = validateTemplate(template, "dev")
      expect(result.valid).toBe(true)
      expect(result.syntaxErrors).toHaveLength(0)
      expect(result.undefinedVariables).toHaveLength(0)
    })

    it("should detect syntax errors", () => {
      const template = "{{#each items}}unclosed block" // Missing closing {{/each}}
      const result = validateTemplate(template, "dev")
      expect(result.valid).toBe(false)
      expect(result.syntaxErrors.length).toBeGreaterThan(0)
      expect(result.syntaxErrors[0]).toContain("Unclosed")
    })

    it("should detect undefined variables", () => {
      const template = "Hello {{undefinedVar}}!"
      const result = validateTemplate(template, "dev")
      expect(result.valid).toBe(false)
      expect(result.undefinedVariables).toContain("undefinedVar")
    })

    it("should allow dev-specific variables for dev role", () => {
      const template = "Branch: {{branchName}}, Worktree: {{worktreeDir}}"
      const result = validateTemplate(template, "dev")
      expect(result.valid).toBe(true)
    })

    it("should reject dev variables for other roles", () => {
      const template = "Branch: {{branchName}}"
      const result = validateTemplate(template, "research")
      expect(result.valid).toBe(false)
      expect(result.undefinedVariables).toContain("branchName")
    })

    it("should validate pm-specific variables", () => {
      const template = "Images: {{#each imageUrls}}{{@index}}. {{/each}}"
      const result = validateTemplate(template, "pm")
      expect(result.valid).toBe(true)
      expect(result.undefinedVariables).toHaveLength(0)
    })

    it("should reject pm variables for dev role", () => {
      const template = "{{#each imageUrls}}{{this}}{{/each}}"
      const result = validateTemplate(template, "dev")
      expect(result.valid).toBe(false)
      expect(result.undefinedVariables).toContain("imageUrls")
    })

    it("should validate reviewer-specific variables", () => {
      const template = "PR #{{prNumber}} on branch {{branchName}}"
      const result = validateTemplate(template, "reviewer")
      expect(result.valid).toBe(true)
    })

    it("should handle conditionals with allowed variables", () => {
      const template = "{{#if prNumber}}PR: {{prNumber}}{{/if}}"
      const result = validateTemplate(template, "reviewer")
      expect(result.valid).toBe(true)
    })

    it("should handle loops with allowed variables", () => {
      const template = `{{#each comments}}
[{{this.timestamp}}] {{this.author}}: {{this.content}}
{{/each}}`
      const result = validateTemplate(template, "dev")
      expect(result.valid).toBe(true)
      expect(result.undefinedVariables).toHaveLength(0)
    })

    it("should allow common variables across all roles", () => {
      const commonVars = ["taskId", "taskTitle", "taskDescription", "projectSlug", "repoDir"]
      for (const role of ["dev", "reviewer", "pm", "research", "conflict_resolver"]) {
        const template = commonVars.map((v) => `{{${v}}}`).join(" ")
        const result = validateTemplate(template, role)
        expect(result.valid).toBe(true)
      }
    })

    it("should handle complex nested templates", () => {
      const template = `
## Task: {{taskTitle}}

Ticket ID: {{taskId}}
Role: dev

{{#if comments}}
### Comments:
{{#each comments}}
- [{{this.timestamp}}] {{this.author}}: {{this.content}}
{{/each}}
{{/if}}

Branch: {{branchName}}
Worktree: {{worktreeDir}}
`
      const result = validateTemplate(template, "dev")
      expect(result.valid).toBe(true)
      expect(result.undefinedVariables).toHaveLength(0)
    })

    it("should skip Handlebars built-in variables like @index", () => {
      const template = "{{#each comments}}{{@index}}: {{this}}{{/each}}"
      const result = validateTemplate(template, "dev")
      expect(result.valid).toBe(true)
      expect(result.undefinedVariables).toHaveLength(0)
    })

    it("should detect multiple undefined variables", () => {
      const template = "{{foo}} {{bar}} {{taskId}}"
      const result = validateTemplate(template, "dev")
      expect(result.valid).toBe(false)
      expect(result.undefinedVariables).toContain("foo")
      expect(result.undefinedVariables).toContain("bar")
      expect(result.undefinedVariables).not.toContain("taskId")
    })
  })

  // ============================================
  // JSON Schema Generation
  // ============================================

  describe("generateVariableSchema", () => {
    it("should generate schema for dev role", () => {
      const schema = generateVariableSchema("dev")
      expect(schema.type).toBe("object")
      expect(schema.properties).toHaveProperty("taskId")
      expect(schema.properties).toHaveProperty("branchName")
      expect(schema.properties).toHaveProperty("worktreeDir")
      expect((schema.required as string[])).toContain("taskId")
    })

    it("should generate schema for pm role", () => {
      const schema = generateVariableSchema("pm")
      const properties = schema.properties as Record<string, unknown>
      expect(properties).toHaveProperty("imageUrls")
      expect(properties).toHaveProperty("signalResponses")
    })

    it("should include descriptions in properties", () => {
      const schema = generateVariableSchema("dev")
      const properties = schema.properties as Record<string, { description?: string }>
      expect(properties.taskId).toHaveProperty("description")
    })
  })

  // ============================================
  // Real-world Prompt Templates
  // ============================================

  describe("real-world templates", () => {
    it("should render dev task context template", () => {
      const template = `## Task: {{taskTitle}}

**Read {{repoDir}}/AGENTS.md first.**

Ticket ID: {{taskId}}
Role: dev

{{taskDescription}}

{{#if comments}}
## Task Comments

{{#each comments}}
[{{timestamp}}] {{author}}: {{content}}
{{/each}}
{{/if}}

Branch: {{branchName}}
Worktree: {{worktreeDir}}`

      const vars: DevTemplateVariables = {
        taskId: "abc123",
        taskTitle: "Fix the thing",
        taskDescription: "This needs fixing",
        projectSlug: "clutch",
        repoDir: "/home/dan/clutch",
        branchName: "fix/abc123-fix",
        worktreeDir: "/home/dan/clutch-worktrees/fix/abc123",
        comments: [
          { author: "alice", content: "Started work", timestamp: "2024-01-01" },
        ],
      }

      const result = renderTemplate(template, vars as unknown as Record<string, unknown>)
      expect(result).toContain("Fix the thing")
      expect(result).toContain("abc123")
      expect(result).toContain("fix/abc123-fix")
      expect(result).toContain("[2024-01-01] alice: Started work")
    })

    it("should render reviewer task context template", () => {
      const template = `## Task: {{taskTitle}}

PR Number: {{#if prNumber}}#{{prNumber}}{{else}}Not set{{/if}}
Worktree: {{worktreeDir}}`

      const vars: ReviewerTemplateVariables = {
        taskId: "abc123",
        taskTitle: "Review PR",
        taskDescription: "Please review",
        projectSlug: "clutch",
        repoDir: "/home/dan/clutch",
        branchName: "fix/abc123",
        worktreeDir: "/home/dan/clutch-worktrees/fix/abc123",
        prNumber: 42,
        comments: [],
      }

      const result = renderTemplate(template, vars as unknown as Record<string, unknown>)
      expect(result).toContain("#42")
      expect(result).toContain("/home/dan/clutch-worktrees/fix/abc123")
    })

    it("should render pm task context template with images", () => {
      const template = `## Task: {{taskTitle}}

{{taskDescription}}

{{#if imageUrls}}
## Attached Images
{{#each imageUrls}}
- Image {{@index}}: {{this}}
{{/each}}
{{/if}}`

      const vars: PmTemplateVariables = {
        taskId: "abc123",
        taskTitle: "Design Review",
        taskDescription: "Review the design",
        projectSlug: "clutch",
        repoDir: "/home/dan/clutch",
        imageUrls: ["http://example.com/img1.png", "http://example.com/img2.png"],
        signalResponses: [],
        comments: [],
      }

      const result = renderTemplate(template, vars as unknown as Record<string, unknown>)
      expect(result).toContain("Image 0: http://example.com/img1.png")
      expect(result).toContain("Image 1: http://example.com/img2.png")
    })

    it("should validate real-world dev template", () => {
      const template = `## Task: {{taskTitle}}

Ticket ID: {{taskId}}

{{taskDescription}}

{{#if comments}}
{{#each comments}}
[{{this.timestamp}}] {{this.author}}: {{this.content}}
{{/each}}
{{/if}}

Branch: {{branchName}}
Worktree: {{worktreeDir}}`

      const result = validateTemplate(template, "dev")
      expect(result.valid).toBe(true)
      expect(result.undefinedVariables).toHaveLength(0)
    })
  })

  // ============================================
  // Backwards Compatibility
  // ============================================

  describe("backwards compatibility", () => {
    it("should render plain text without variables unchanged", () => {
      const template = "This is a plain text prompt with no variables."
      const result = renderTemplate(template, {})
      expect(result).toBe(template)
    })

    it("should validate plain text templates", () => {
      const template = "Plain text prompt with no template syntax."
      const result = validateTemplate(template, "dev")
      expect(result.valid).toBe(true)
    })

    it("should handle empty templates", () => {
      const result = renderTemplate("", {})
      expect(result).toBe("")
    })

    it("should preserve newlines and formatting", () => {
      const template = "Line 1\nLine 2\n\nLine 3"
      const result = renderTemplate(template, {})
      expect(result).toBe(template)
    })
  })
})
