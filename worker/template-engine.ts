/**
 * Template Engine
 *
 * Wrapper around Handlebars for prompt template rendering and validation.
 * Provides compile-time validation for template syntax and variable references.
 */

import Handlebars from "handlebars"

// ============================================
// Variable Schema Definitions
// ============================================

/**
 * Common variables available to all roles
 */
export interface CommonTemplateVariables {
  taskId: string
  taskTitle: string
  taskDescription: string
  projectSlug: string
  repoDir: string
  comments: Array<{ author: string; content: string; timestamp: string }>
}

/**
 * Dev role specific variables
 */
export interface DevTemplateVariables extends CommonTemplateVariables {
  branchName: string
  worktreeDir: string
}

/**
 * Reviewer/ConflictResolver role specific variables
 */
export interface ReviewerTemplateVariables extends CommonTemplateVariables {
  prNumber: number | null
  branchName: string
  worktreeDir: string
}

/**
 * PM role specific variables
 */
export interface PmTemplateVariables extends CommonTemplateVariables {
  imageUrls: string[]
  signalResponses: Array<{ question: string; response: string }>
}

/**
 * All possible template variables (union type for validation)
 */
export type AllTemplateVariables =
  | CommonTemplateVariables
  | DevTemplateVariables
  | ReviewerTemplateVariables
  | PmTemplateVariables

/**
 * Variable schema definition for a role
 */
export interface VariableSchema {
  /** Variable name */
  name: string
  /** Type hint for documentation */
  type: "string" | "number" | "boolean" | "array" | "object"
  /** Whether the variable is required */
  required: boolean
  /** Description for documentation */
  description: string
}

// ============================================
// Role Variable Schemas
// ============================================

/**
 * Common variables schema (shared across all roles)
 */
export const COMMON_VARIABLES: VariableSchema[] = [
  { name: "taskId", type: "string", required: true, description: "Unique task identifier" },
  { name: "taskTitle", type: "string", required: true, description: "Task title" },
  { name: "taskDescription", type: "string", required: true, description: "Task description" },
  { name: "projectSlug", type: "string", required: true, description: "Project slug for CLI commands" },
  { name: "repoDir", type: "string", required: true, description: "Repository directory path" },
  { name: "comments", type: "array", required: false, description: "Task comments from previous work" },
]

/**
 * Dev role variable schema
 */
export const DEV_VARIABLES: VariableSchema[] = [
  ...COMMON_VARIABLES,
  { name: "branchName", type: "string", required: true, description: "Git branch name" },
  { name: "worktreeDir", type: "string", required: true, description: "Worktree directory path" },
]

/**
 * Reviewer role variable schema
 */
export const REVIEWER_VARIABLES: VariableSchema[] = [
  ...COMMON_VARIABLES,
  { name: "prNumber", type: "number", required: false, description: "Pull request number" },
  { name: "branchName", type: "string", required: true, description: "Git branch name" },
  { name: "worktreeDir", type: "string", required: true, description: "Worktree directory path" },
]

/**
 * ConflictResolver role variable schema (same as reviewer)
 */
export const CONFLICT_RESOLVER_VARIABLES: VariableSchema[] = REVIEWER_VARIABLES

/**
 * PM role variable schema
 */
export const PM_VARIABLES: VariableSchema[] = [
  ...COMMON_VARIABLES,
  { name: "imageUrls", type: "array", required: false, description: "Attached image URLs" },
  { name: "signalResponses", type: "array", required: false, description: "Signal Q&A responses" },
  { name: "hasImages", type: "boolean", required: false, description: "Whether images are attached" },
  { name: "hasSignalResponses", type: "boolean", required: false, description: "Whether signal Q&A exists" },
  { name: "hasComments", type: "boolean", required: false, description: "Whether task comments exist" },
]

/**
 * Research role variable schema
 */
export const RESEARCH_VARIABLES: VariableSchema[] = [
  ...COMMON_VARIABLES,
  { name: "hasComments", type: "boolean", required: false, description: "Whether task comments exist" },
]

/**
 * Map of role to variable schema
 */
export const ROLE_VARIABLE_SCHEMAS: Record<string, VariableSchema[]> = {
  dev: DEV_VARIABLES,
  reviewer: REVIEWER_VARIABLES,
  conflict_resolver: CONFLICT_RESOLVER_VARIABLES,
  pm: PM_VARIABLES,
  research: RESEARCH_VARIABLES,
  researcher: RESEARCH_VARIABLES, // Backwards compatibility
}

/**
 * Get variable names for a role
 */
export function getVariableNamesForRole(role: string): Set<string> {
  const schema = ROLE_VARIABLE_SCHEMAS[role] || COMMON_VARIABLES
  return new Set(schema.map((v) => v.name))
}

// ============================================
// Template Caching
// ============================================

/**
 * Cache for compiled Handlebars templates.
 * Key: template content hash or content itself (for short templates)
 * Value: Compiled Handlebars template function
 */
const templateCache = new Map<string, Handlebars.TemplateDelegate>()

/**
 * Get cache key for a template.
 * Uses first 64 chars of SHA-256 hash for long templates to keep keys short.
 */
function getCacheKey(template: string): string {
  // For short templates, use content directly as key
  if (template.length < 100) {
    return template
  }
  // For longer templates, use a simple hash (first 64 chars)
  // Note: Using simple truncation-based "hash" for performance
  // In production with crypto available, could use actual hash
  return `hash:${template.slice(0, 50)}:${template.slice(-10)}:${template.length}`
}

/**
 * Clear the template cache.
 * Useful for testing or when memory needs to be reclaimed.
 */
export function clearTemplateCache(): void {
  templateCache.clear()
}

/**
 * Get cache statistics for debugging/monitoring.
 */
export function getTemplateCacheStats(): { size: number; keys: string[] } {
  return {
    size: templateCache.size,
    keys: Array.from(templateCache.keys()).slice(0, 10), // Limit keys in output
  }
}

// ============================================
// Template Compilation & Rendering
// ============================================

/**
 * Handlebars built-in helpers and special variables
 */
const HANDLEBARS_HELPERS = new Set(["if", "unless", "each", "with", "lookup", "log", "helperMissing", "blockHelperMissing"])

/**
 * Extract variable references from a Handlebars template AST
 * Handles simple variables like {{name}} and path variables like {{user.name}}
 * Properly handles block params ({{#each items as |item|}}) and built-in variables
 */
function extractTemplateVariables(template: string): Set<string> {
  const variables = new Set<string>()

  try {
    // Parse the template to get the AST
    const ast = Handlebars.parse(template)

    // Track block params at each nesting level
    const blockParamStack: string[][] = []

    // Helper to check if a name is a block param
    function isBlockParam(name: string): boolean {
      // Handle @data variables (@index, @first, @last, etc.)
      if (name.startsWith("@")) {
        return true
      }
      // Handle this keyword
      if (name === "this" || name.startsWith("this.")) {
        return true
      }
      // Check block param stack
      for (const level of blockParamStack) {
        if (level.includes(name)) {
          return true
        }
      }
      return false
    }

    // Helper to extract root variable from a path
    function extractRootVariable(pathNode: Record<string, unknown> | undefined): string | null {
      if (!pathNode || pathNode.type !== "PathExpression") {
        return null
      }

      const parts = pathNode.parts as string[] | undefined
      const original = pathNode.original as string | undefined
      const depth = (pathNode.depth as number) || 0

      if (!original) return null

      // Skip built-ins and block params
      if (isBlockParam(original)) {
        return null
      }

      // Skip helpers
      if (HANDLEBARS_HELPERS.has(original)) {
        return null
      }

      // If depth > 0, this is a parent reference (../), skip it
      if (depth > 0) {
        return null
      }

      // Get root variable name
      if (parts && parts.length > 0) {
        return parts[0]
      }

      return original
    }

    // Walk the AST to find all variable references
    function walkNode(node: unknown): void {
      if (!node || typeof node !== "object") return

      const nodeObj = node as Record<string, unknown>

      // Handle MustacheStatement ({{variable}})
      if (nodeObj.type === "MustacheStatement") {
        const path = nodeObj.path as Record<string, unknown> | undefined

        // Skip helpers
        if (path && HANDLEBARS_HELPERS.has(path.original as string)) {
          // Process params for helpers
          const params = nodeObj.params as unknown[] | undefined
          if (params) {
            params.forEach((param) => {
              const root = extractRootVariable(param as Record<string, unknown>)
              if (root) variables.add(root)
            })
          }
        } else {
          // Regular variable reference
          const root = extractRootVariable(path)
          if (root) variables.add(root)
        }

        // Process hash params (key=value pairs)
        const hash = nodeObj.hash as Record<string, unknown> | undefined
        if (hash?.pairs) {
          const pairs = hash.pairs as Array<{ value: Record<string, unknown> }>
          pairs.forEach((pair) => {
            const root = extractRootVariable(pair.value)
            if (root) variables.add(root)
          })
        }
      }

      // Handle BlockStatement ({{#each}}, {{#if}}, etc.)
      if (nodeObj.type === "BlockStatement") {
        const path = nodeObj.path as Record<string, unknown> | undefined
        const params = nodeObj.params as unknown[] | undefined
        const helperName = path?.original as string

        // For {{#each items}} or {{#if condition}}, extract the collection/condition variable
        if (params && params.length > 0) {
          const root = extractRootVariable(params[0] as Record<string, unknown>)
          if (root) variables.add(root)
        }

        // Walk the program (block body)
        const program = nodeObj.program as Record<string, unknown> | undefined
        if (program) {
          // Push block params for this level
          const blockParams = program.blockParams as string[] | undefined
          if (blockParams && blockParams.length > 0) {
            blockParamStack.push(blockParams)
          }
          walkNode(program)
          if (blockParams && blockParams.length > 0) {
            blockParamStack.pop()
          }
        }

        // Walk the inverse (else block)
        const inverse = nodeObj.inverse as Record<string, unknown> | undefined
        if (inverse) {
          const inverseBlockParams = inverse.blockParams as string[] | undefined
          if (inverseBlockParams && inverseBlockParams.length > 0) {
            blockParamStack.push(inverseBlockParams)
          }
          walkNode(inverse)
          if (inverseBlockParams && inverseBlockParams.length > 0) {
            blockParamStack.pop()
          }
        }

        return
      }

      // Handle Program nodes (template body)
      if (nodeObj.type === "Program") {
        const body = nodeObj.body as unknown[] | undefined
        if (body) {
          body.forEach(walkNode)
        }
        return
      }

      // Recursively walk child arrays
      for (const key of Object.keys(nodeObj)) {
        const value = nodeObj[key]
        // Skip already-handled properties
        if (key === "program" || key === "inverse" || key === "path" || key === "params") {
          continue
        }
        if (Array.isArray(value)) {
          value.forEach(walkNode)
        } else if (typeof value === "object" && value !== null) {
          walkNode(value)
        }
      }
    }

    walkNode(ast)
  } catch {
    // If parsing fails, we'll catch it in compileTemplate
  }

  return variables
}

/**
 * Result of template validation
 */
export interface ValidationResult {
  valid: boolean
  /** Syntax errors from Handlebars compilation */
  syntaxErrors: string[]
  /** Undefined variables referenced in template */
  undefinedVariables: string[]
}

/**
 * Handlebars built-in special variables that should not be validated
 */
const HANDLEBARS_BUILTINS = new Set([
  "this",
  "@index",
  "@first",
  "@last",
  "@key",
  "@root",
  "@level",
])

/**
 * Check if a template has mismatched braces
 */
function checkMismatchedBraces(template: string): string[] {
  const errors: string[] = []

  // Check for unclosed blocks (e.g., {{#each items}} without {{/each}})
  const openBlockRegex = /\{\{#(\w+)/g
  const closeBlockRegex = /\{\{\/(\w+)/g

  const openBlocks: string[] = []
  let match

  while ((match = openBlockRegex.exec(template)) !== null) {
    if (!["else"].includes(match[1])) {
      openBlocks.push(match[1])
    }
  }

  while ((match = closeBlockRegex.exec(template)) !== null) {
    const index = openBlocks.lastIndexOf(match[1])
    if (index !== -1) {
      openBlocks.splice(index, 1)
    } else {
      errors.push(`Unexpected closing block: {{/${match[1]}}}`)
    }
  }

  if (openBlocks.length > 0) {
    errors.push(`Unclosed blocks: ${openBlocks.join(", ")}`)
  }

  return errors
}

/**
 * Validate a template for syntax errors and undefined variables
 *
 * @param template - The template string to validate
 * @param role - The role to validate variable references against
 * @returns Validation result with errors if any
 */
export function validateTemplate(template: string, role: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    syntaxErrors: [],
    undefinedVariables: [],
  }

  // Check for mismatched braces/blocks
  const braceErrors = checkMismatchedBraces(template)
  if (braceErrors.length > 0) {
    result.valid = false
    result.syntaxErrors.push(...braceErrors)
    return result
  }

  // Check for syntax errors by compiling
  try {
    Handlebars.compile(template)
  } catch (error) {
    result.valid = false
    result.syntaxErrors.push(error instanceof Error ? error.message : String(error))
    return result
  }

  // Extract variables and check against schema
  const referencedVars = extractTemplateVariables(template)
  const allowedVars = getVariableNamesForRole(role)

  // Check for undefined variables
  for (const varName of referencedVars) {
    // Skip Handlebars built-ins
    if (HANDLEBARS_BUILTINS.has(varName)) {
      continue
    }
    if (!allowedVars.has(varName)) {
      result.undefinedVariables.push(varName)
    }
  }

  if (result.undefinedVariables.length > 0) {
    result.valid = false
  }

  return result
}

/**
 * Compile and render a template with the given variables.
 *
 * Uses a cache to avoid recompiling the same template multiple times.
 * Cache key is derived from template content.
 *
 * @param template - The Handlebars template string
 * @param variables - The variables to inject into the template
 * @returns Rendered string
 * @throws Error if template has syntax errors
 */
export function renderTemplate<T extends Record<string, unknown>>(
  template: string,
  variables: T
): string {
  const cacheKey = getCacheKey(template)

  // Check cache first
  let compiled = templateCache.get(cacheKey)
  if (!compiled) {
    // Compile and cache
    compiled = Handlebars.compile(template, {
      strict: false, // Allow undefined variables (they render as empty string)
      preventIndent: true,
    })
    templateCache.set(cacheKey, compiled)
  }

  // Render with variables
  return compiled(variables)
}

/**
 * Safe template rendering that returns error info instead of throwing
 *
 * @param template - The Handlebars template string
 * @param variables - The variables to inject into the template
 * @returns Object with rendered string or error
 */
export function renderTemplateSafe<T extends Record<string, unknown>>(
  template: string,
  variables: T
): { success: true; rendered: string } | { success: false; error: string } {
  try {
    const rendered = renderTemplate(template, variables)
    return { success: true, rendered }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ============================================
// JSON Schema Generation
// ============================================

/**
 * Generate a JSON schema for template variables of a role
 *
 * @param role - The role to generate schema for
 * @returns JSON schema object
 */
export function generateVariableSchema(role: string): Record<string, unknown> {
  const schemas: Record<string, VariableSchema[]> = {
    common: COMMON_VARIABLES,
    dev: DEV_VARIABLES,
    reviewer: REVIEWER_VARIABLES,
    conflict_resolver: CONFLICT_RESOLVER_VARIABLES,
    pm: PM_VARIABLES,
    research: RESEARCH_VARIABLES,
  }

  const roleSchema = schemas[role] || COMMON_VARIABLES

  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const variable of roleSchema) {
    let type: string | string[] = variable.type

    // Map our types to JSON schema types
    if (variable.type === "array") {
      type = "array"
    }

    properties[variable.name] = {
      type,
      description: variable.description,
    }

    if (variable.required) {
      required.push(variable.name)
    }
  }

  return {
    type: "object",
    properties,
    required,
  }
}

// ============================================
// Handlebars Helpers
// ============================================

/**
 * Register standard Handlebars helpers for prompts
 */
export function registerPromptHelpers(): void {
  // Helper for formatting arrays as bullet lists
  Handlebars.registerHelper("bulletList", function (items: unknown[]) {
    if (!Array.isArray(items) || items.length === 0) {
      return ""
    }
    return items.map((item) => `- ${item}`).join("\n")
  })

  // Helper for conditional sections
  Handlebars.registerHelper("section", function (title: string, content: string) {
    if (!content) {
      return ""
    }
    return `\n## ${title}\n\n${content}\n`
  })

  // Helper for formatting code blocks
  Handlebars.registerHelper("codeBlock", function (language: string, code: string) {
    return "\n```" + language + "\n" + code + "\n```\n"
  })
}

// Register helpers on module load
registerPromptHelpers()
