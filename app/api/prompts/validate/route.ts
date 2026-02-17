import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// POST /api/prompts/validate — Dry-run validation of a template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { role, content } = body

    if (!role || !content) {
      return NextResponse.json(
        { error: "Missing required fields: role, content" },
        { status: 400 }
      )
    }

    const convex = getConvexClient()
    const validation = await convex.query(api.promptVersions.validate, {
      role,
      content,
    })

    // Get variable schema to check for unused variables
    const { schema } = await convex.query(api.promptVersions.getVariableSchema, {
      role,
    })

    // Extract used variables from the template
    const usedVars = extractTemplateVariables(content)
    const definedVars = new Set(schema.map((v: { name: string }) => v.name))
    const unusedVars = Array.from(definedVars).filter((v) => !usedVars.has(v))

    return NextResponse.json({
      valid: validation.valid,
      syntaxErrors: validation.syntaxErrors,
      undefinedVariables: validation.undefinedVariables,
      unusedVariables: unusedVars,
      schema,
    })
  } catch (error) {
    console.error("[Prompts Validate API] Error validating template:", error)
    return NextResponse.json(
      { error: "Failed to validate template" },
      { status: 500 }
    )
  }
}

/**
 * Extract variable references from a Handlebars template
 */
function extractTemplateVariables(template: string): Set<string> {
  const variables = new Set<string>()
  const regex = /\{\{\{?[#/]?(\w+)(?:\.[\w.]+)?\}?\}?/g
  let match

  while ((match = regex.exec(template)) !== null) {
    const varName = match[1]
    // Skip Handlebars built-in helpers
    if (varName && !["if", "unless", "each", "with", "this"].includes(varName)) {
      variables.add(varName)
    }
  }

  return variables
}
