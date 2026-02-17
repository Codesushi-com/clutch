import { describe, it, expect } from "vitest"
import { renderTemplate, validateTemplate } from "../template-engine"
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe("Phase 4b: Reviewer and ConflictResolver Template Migration", () => {
  const ROLES_DIR = path.join(__dirname, "../../roles")

  describe("Reviewer v2 Template", () => {
    const templatePath = path.join(ROLES_DIR, "reviewer-v2-template.md")
    
    it("should exist", () => {
      expect(fs.existsSync(templatePath)).toBe(true)
    })

    it("should be valid Handlebars syntax", () => {
      const content = fs.readFileSync(templatePath, "utf-8")
      const result = validateTemplate(content, "reviewer")
      expect(result.valid).toBe(true)
      expect(result.syntaxErrors).toHaveLength(0)
      expect(result.undefinedVariables).toHaveLength(0)
    })

    it("should render with all reviewer variables", () => {
      const content = fs.readFileSync(templatePath, "utf-8")
      const variables = {
        taskId: "test-task-123",
        taskTitle: "Test Task Title",
        taskDescription: "Test task description",
        projectSlug: "test-project",
        repoDir: "/home/user/project",
        worktreeDir: "/home/user/project-worktrees/fix/test-task",
        prNumber: 42,
        branchName: "fix/test-task-123",
        comments: [
          { author: "dev", content: "First comment", timestamp: "2024-01-01T00:00:00Z" },
        ],
      }
      
      const result = renderTemplate(content, variables)
      
      // Verify key content is rendered
      expect(result).toContain("Test Task Title")
      expect(result).toContain("Test task description")
      expect(result).toContain("test-task-123")
      expect(result).toContain("#42")
      expect(result).toContain("/home/user/project")
      expect(result).toContain("/home/user/project-worktrees/fix/test-task")
      expect(result).toContain("gh pr diff 42")
      expect(result).toContain("gh pr merge 42 --squash --delete-branch")
      expect(result).toContain("clutch tasks comment test-task-123 --project test-project")
    })

    it("should handle missing optional variables gracefully", () => {
      const content = fs.readFileSync(templatePath, "utf-8")
      const variables = {
        taskId: "test-task-123",
        taskTitle: "Test Task",
        taskDescription: "Description",
        projectSlug: "clutch",
        repoDir: "/home/user/project",
        worktreeDir: "/home/user/project-worktrees/fix/test-task",
        prNumber: null,
        branchName: "fix/test-task-123",
        comments: [],
      }
      
      const result = renderTemplate(content, variables)
      
      // Should still render without errors
      expect(result).toContain("Test Task")
      expect(result).toContain("Description")
    })
  })

  describe("ConflictResolver v2 Template", () => {
    const templatePath = path.join(ROLES_DIR, "conflict_resolver-v2-template.md")
    
    it("should exist", () => {
      expect(fs.existsSync(templatePath)).toBe(true)
    })

    it("should be valid Handlebars syntax", () => {
      const content = fs.readFileSync(templatePath, "utf-8")
      const result = validateTemplate(content, "conflict_resolver")
      expect(result.valid).toBe(true)
      expect(result.syntaxErrors).toHaveLength(0)
      expect(result.undefinedVariables).toHaveLength(0)
    })

    it("should render with all conflict_resolver variables", () => {
      const content = fs.readFileSync(templatePath, "utf-8")
      const variables = {
        taskId: "test-task-456",
        taskTitle: "Conflict Resolution Task",
        taskDescription: "Fix merge conflicts",
        projectSlug: "my-project",
        repoDir: "/home/user/repo",
        worktreeDir: "/home/user/repo-worktrees/fix/test-task-456",
        prNumber: 99,
        branchName: "fix/test-task-456",
        comments: [],
      }
      
      const result = renderTemplate(content, variables)
      
      // Verify key content is rendered
      expect(result).toContain("Conflict Resolution Task")
      expect(result).toContain("Fix merge conflicts")
      expect(result).toContain("test-task-456")
      expect(result).toContain("#99")
      expect(result).toContain("fix/test-task-456")
      expect(result).toContain("GIT_SEQUENCE_EDITOR=true git rebase origin/main")
      expect(result).toContain("git push --force-with-lease")
      expect(result).toContain("clutch tasks move test-task-456 --project my-project in_review")
      expect(result).toContain("NEVER move tasks to done")
    })

    it("should include all conflict resolution steps", () => {
      const content = fs.readFileSync(templatePath, "utf-8")
      const variables = {
        taskId: "test",
        taskTitle: "Test",
        taskDescription: "Test desc",
        projectSlug: "clutch",
        repoDir: "/repo",
        worktreeDir: "/repo-worktrees/fix/test",
        prNumber: 1,
        branchName: "fix/test",
        comments: [],
      }
      
      const result = renderTemplate(content, variables)
      
      // Verify key sections are present
      expect(result).toContain("Fetch latest main and attempt rebase")
      expect(result).toContain("git diff --name-only --diff-filter=U")
      expect(result).toContain("git rebase --abort")
      expect(result).toContain("Headless-safe git operations")
      expect(result).toContain("Never use `git rebase -i`")
    })
  })
})
