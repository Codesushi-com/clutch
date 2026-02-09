import { describe, it, expect } from "vitest"
import { POST, PATCH, DELETE } from "./route"
import { NextRequest } from "next/server"

describe("POST /api/feature-builder/session", () => {
  it("should return 400 when project_id is missing", async () => {
    // Set environment variable for this test
    const originalUrl = process.env.CONVEX_URL
    process.env.CONVEX_URL = "http://localhost:3210"

    const request = new NextRequest("http://localhost:3002/api/feature-builder/session", {
      method: "POST",
      body: JSON.stringify({}),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain("project_id is required")

    // Restore environment
    process.env.CONVEX_URL = originalUrl
  })

  it("should return 500 when neither CONVEX_URL nor NEXT_PUBLIC_CONVEX_URL is set", async () => {
    // Temporarily remove environment variables
    const originalUrl = process.env.CONVEX_URL
    const originalPublicUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    delete process.env.CONVEX_URL
    delete process.env.NEXT_PUBLIC_CONVEX_URL

    const request = new NextRequest("http://localhost:3002/api/feature-builder/session", {
      method: "POST",
      body: JSON.stringify({ project_id: "project-123" }),
    })

    const response = await POST(request)
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toContain("not configured")

    // Restore environment
    process.env.CONVEX_URL = originalUrl
    process.env.NEXT_PUBLIC_CONVEX_URL = originalPublicUrl
  })
})

describe("PATCH /api/feature-builder/session", () => {
  it("should return 400 when id is missing", async () => {
    const originalUrl = process.env.CONVEX_URL
    process.env.CONVEX_URL = "http://localhost:3210"

    const request = new NextRequest("http://localhost:3002/api/feature-builder/session", {
      method: "PATCH",
      body: JSON.stringify({ current_step: "overview" }),
    })

    const response = await PATCH(request)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain("id is required")

    process.env.CONVEX_URL = originalUrl
  })
})

describe("DELETE /api/feature-builder/session", () => {
  it("should return 400 when id is missing", async () => {
    const originalUrl = process.env.CONVEX_URL
    process.env.CONVEX_URL = "http://localhost:3210"

    const request = new NextRequest("http://localhost:3002/api/feature-builder/session", {
      method: "DELETE",
      body: JSON.stringify({ action: "cancel" }),
    })

    const response = await DELETE(request)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain("id is required")

    process.env.CONVEX_URL = originalUrl
  })

  it("should return 400 for invalid action", async () => {
    const originalUrl = process.env.CONVEX_URL
    process.env.CONVEX_URL = "http://localhost:3210"

    const request = new NextRequest("http://localhost:3002/api/feature-builder/session", {
      method: "DELETE",
      body: JSON.stringify({ id: "session-123", action: "invalid" }),
    })

    const response = await DELETE(request)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain("Invalid action")

    process.env.CONVEX_URL = originalUrl
  })
})
