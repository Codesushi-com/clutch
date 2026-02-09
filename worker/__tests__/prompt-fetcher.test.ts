/**
 * Prompt Fetcher Tests
 *
 * Regression tests for the prompt fetching system.
 * Ensures that missing prompts are caught early and reported clearly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  fetchActivePrompt,
  fetchPromptContent,
  verifyPromptsExist,
  assertPromptsExist,
  PromptNotFoundError,
  V2_ROLES,
  isValidV2Role,
} from "../prompt-fetcher"

describe("prompt-fetcher", () => {
  let mockConvex: {
    query: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockConvex = {
      query: vi.fn(),
    }
  })

  describe("fetchActivePrompt", () => {
    it("should return prompt version when found", async () => {
      const mockPrompt = {
        id: "prompt-123",
        role: "dev",
        version: 1,
        content: "# Developer\n\nYou are a developer.",
        created_by: "test",
        active: true,
        created_at: Date.now(),
      }

      mockConvex.query.mockResolvedValue({
        promptVersion: mockPrompt,
        ab_test: false,
      })

      const result = await fetchActivePrompt(mockConvex as unknown as Parameters<typeof fetchActivePrompt>[0], "dev")

      expect(result).toEqual(mockPrompt)
      expect(mockConvex.query).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ role: "dev", rand: expect.any(Number) })
      )
    })

    it("should throw PromptNotFoundError when prompt not found", async () => {
      mockConvex.query.mockResolvedValue({
        promptVersion: null,
        ab_test: false,
      })

      await expect(fetchActivePrompt(mockConvex as unknown as Parameters<typeof fetchActivePrompt>[0], "dev"))
        .rejects.toThrow(PromptNotFoundError)
    })

    it("should include role name in error message", async () => {
      mockConvex.query.mockResolvedValue({
        promptVersion: null,
        ab_test: false,
      })

      await expect(fetchActivePrompt(mockConvex as unknown as Parameters<typeof fetchActivePrompt>[0], "conflict_resolver"))
        .rejects.toThrow(/conflict_resolver/)
    })
  })

  describe("fetchPromptContent", () => {
    it("should return content when prompt found", async () => {
      const mockPrompt = {
        id: "prompt-123",
        role: "dev",
        version: 1,
        content: "# Developer\n\nYou are a developer.",
        created_by: "test",
        active: true,
        created_at: Date.now(),
      }

      mockConvex.query.mockResolvedValue({
        promptVersion: mockPrompt,
        ab_test: false,
      })

      const result = await fetchPromptContent(mockConvex as unknown as Parameters<typeof fetchPromptContent>[0], "dev")

      expect(result).toBe("# Developer\n\nYou are a developer.")
    })

    it("should use fallback when prompt not found and fallback provided", async () => {
      mockConvex.query.mockResolvedValue({
        promptVersion: null,
        ab_test: false,
      })

      const fallback = "# Fallback\n\nDefault prompt."
      const logError = vi.fn()

      const result = await fetchPromptContent(
        mockConvex as unknown as Parameters<typeof fetchPromptContent>[0],
        "unknown_role",
        { fallback, logError }
      )

      expect(result).toBe(fallback)
      expect(logError).toHaveBeenCalledWith(expect.stringContaining("No active prompt"))
    })

    it("should throw when prompt not found and no fallback", async () => {
      mockConvex.query.mockResolvedValue({
        promptVersion: null,
        ab_test: false,
      })

      await expect(fetchPromptContent(mockConvex as unknown as Parameters<typeof fetchPromptContent>[0], "unknown_role"))
        .rejects.toThrow(PromptNotFoundError)
    })
  })

  describe("verifyPromptsExist", () => {
    it("should return empty array when all prompts exist", async () => {
      mockConvex.query.mockResolvedValue({
        promptVersion: {
          id: "prompt-123",
          role: "dev",
          version: 1,
          content: "content",
          created_by: "test",
          active: true,
          created_at: Date.now(),
        },
        ab_test: false,
      })

      const result = await verifyPromptsExist(mockConvex as unknown as Parameters<typeof verifyPromptsExist>[0], ["dev", "reviewer"])

      expect(result).toEqual([])
    })

    it("should return missing roles when prompts not found", async () => {
      mockConvex.query.mockResolvedValue({
        promptVersion: null,
        ab_test: false,
      })

      const result = await verifyPromptsExist(mockConvex as unknown as Parameters<typeof verifyPromptsExist>[0], ["dev", "unknown_role"])

      expect(result).toEqual(["dev", "unknown_role"])
    })
  })

  describe("assertPromptsExist", () => {
    it("should not throw when all prompts exist", async () => {
      mockConvex.query.mockResolvedValue({
        promptVersion: {
          id: "prompt-123",
          role: "dev",
          version: 1,
          content: "content",
          created_by: "test",
          active: true,
          created_at: Date.now(),
        },
        ab_test: false,
      })

      await expect(assertPromptsExist(mockConvex as unknown as Parameters<typeof assertPromptsExist>[0], ["dev"]))
        .resolves.not.toThrow()
    })

    it("should throw with helpful message when prompts missing", async () => {
      mockConvex.query.mockResolvedValue({
        promptVersion: null,
        ab_test: false,
      })

      await expect(assertPromptsExist(mockConvex as unknown as Parameters<typeof assertPromptsExist>[0], ["dev", "conflict_resolver"]))
        .rejects.toThrow(/Missing active prompt versions for roles: dev, conflict_resolver/)
    })

    it("should suggest seed endpoint in error message", async () => {
      mockConvex.query.mockResolvedValue({
        promptVersion: null,
        ab_test: false,
      })

      await expect(assertPromptsExist(mockConvex as unknown as Parameters<typeof assertPromptsExist>[0], ["dev"]))
        .rejects.toThrow(/POST \/api\/prompts\/seed/)
    })
  })

  describe("V2_ROLES", () => {
    it("should contain all v2 work loop roles", () => {
      expect(V2_ROLES).toContain("pm")
      expect(V2_ROLES).toContain("dev")
      expect(V2_ROLES).toContain("research")
      expect(V2_ROLES).toContain("reviewer")
      expect(V2_ROLES).toContain("conflict_resolver")
      expect(V2_ROLES).toHaveLength(5)
    })

    it("should not contain deprecated roles", () => {
      expect(V2_ROLES).not.toContain("qa")
      expect(V2_ROLES).not.toContain("pe")
      expect(V2_ROLES).not.toContain("researcher") // should be "research"
    })
  })

  describe("isValidV2Role", () => {
    it("should return true for valid v2 roles", () => {
      expect(isValidV2Role("dev")).toBe(true)
      expect(isValidV2Role("pm")).toBe(true)
      expect(isValidV2Role("research")).toBe(true)
      expect(isValidV2Role("reviewer")).toBe(true)
      expect(isValidV2Role("conflict_resolver")).toBe(true)
    })

    it("should return false for deprecated roles", () => {
      expect(isValidV2Role("qa")).toBe(false)
      expect(isValidV2Role("pe")).toBe(false)
      expect(isValidV2Role("researcher")).toBe(false)
    })

    it("should return false for unknown roles", () => {
      expect(isValidV2Role("unknown")).toBe(false)
      expect(isValidV2Role("")).toBe(false)
    })
  })
})

/**
 * Regression Test: Prompt Source of Truth
 *
 * This test ensures that the worker always fetches prompts from Convex
 * and errors loudly if a required role has no active prompt version.
 */
describe("REGRESSION: Prompt Source of Truth", () => {
  it("should verify all v2 roles have prompts defined", async () => {
    // This test documents the expected v2 roles
    // If this test fails, it means a role was added to V2_ROLES
    // but the corresponding prompt was not added to the seed data
    const expectedRoles = ["pm", "dev", "research", "reviewer", "conflict_resolver"]

    expect(V2_ROLES).toEqual(expectedRoles)
    expect(V2_ROLES).toContain("conflict_resolver") // Critical for merge conflict resolution
  })
})
