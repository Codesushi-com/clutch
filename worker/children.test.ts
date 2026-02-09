import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ChildProcess } from "node:child_process"

// Track the mock spawn function so we can access it in tests
let mockSpawnFn = vi.fn()

vi.mock(import("node:child_process"), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: { ...actual, spawn: (...args: unknown[]) => mockSpawnFn(...args) },
    spawn: (...args: unknown[]) => mockSpawnFn(...args),
  }
})

// Import after mock setup
const { ChildManager } = await import("./children")
import type { SpawnParams } from "./children"

describe("ChildManager", () => {
  let manager: InstanceType<typeof ChildManager>

  // Helper to create a mock ChildProcess
  function createMockChildProcess(pid: number): ChildProcess {
    const stdout = {
      on: vi.fn(),
    }
    const stderr = {
      on: vi.fn(),
    }
    const proc = {
      pid,
      stdout,
      stderr,
      kill: vi.fn(),
      on: vi.fn(),
    } as unknown as ChildProcess

    return proc
  }

  beforeEach(() => {
    manager = new ChildManager()
    vi.useFakeTimers()
    mockSpawnFn = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("spawn", () => {
    it("should spawn openclaw chat with message", () => {
      const mockProc = createMockChildProcess(1234)
      mockSpawnFn.mockReturnValue(mockProc)

      const params: SpawnParams = {
        taskId: "task-123",
        projectId: "proj-456",
        role: "dev",
        message: "Implement feature",
      }

      const child = manager.spawn(params)

      expect(mockSpawnFn).toHaveBeenCalledWith(
        "openclaw",
        ["chat", "--message", "Implement feature"],
        {
          stdio: ["ignore", "pipe", "pipe"],
          env: expect.any(Object),
        }
      )
      expect(child.pid).toBe(1234)
      expect(child.taskId).toBe("task-123")
      expect(child.projectId).toBe("proj-456")
      expect(child.role).toBe("dev")
      expect(child.sessionKey).toBe("workloop:dev:task-123")
    })

    it("should include model flag when provided", () => {
      const mockProc = createMockChildProcess(1234)
      mockSpawnFn.mockReturnValue(mockProc)

      manager.spawn({
        taskId: "task-123",
        projectId: "proj-456",
        role: "dev",
        message: "Do work",
        model: "claude-sonnet",
      })

      expect(mockSpawnFn).toHaveBeenCalledWith(
        "openclaw",
        ["chat", "--message", "Do work", "--model", "claude-sonnet"],
        expect.any(Object)
      )
    })

    it("should include label flag when provided", () => {
      const mockProc = createMockChildProcess(1234)
      mockSpawnFn.mockReturnValue(mockProc)

      manager.spawn({
        taskId: "task-123",
        projectId: "proj-456",
        role: "dev",
        message: "Do work",
        label: "my-task",
      })

      expect(mockSpawnFn).toHaveBeenCalledWith(
        "openclaw",
        ["chat", "--message", "Do work", "--label", "my-task"],
        expect.any(Object)
      )
    })

    it("should throw if process has no pid", () => {
      const mockProc = createMockChildProcess(1234)
      // Create a copy without pid to simulate failure case
      const procWithoutPid = { ...mockProc, pid: undefined } as unknown as ChildProcess
      mockSpawnFn.mockReturnValue(procWithoutPid)

      expect(() =>
        manager.spawn({
          taskId: "task-123",
          projectId: "proj-456",
          role: "dev",
          message: "Do work",
        })
      ).toThrow("Failed to spawn openclaw process for task task-123")
    })

    it("should track child and allow retrieval", () => {
      const mockProc = createMockChildProcess(1234)
      mockSpawnFn.mockReturnValue(mockProc)

      const child = manager.spawn({
        taskId: "task-123",
        projectId: "proj-456",
        role: "dev",
        message: "Do work",
      })

      expect(manager.get("task-123")).toBe(child)
      expect(manager.size()).toBe(1)
    })
  })

  describe("stdout/stderr tracking", () => {
    it("should update lastOutput on stdout data", () => {
      const mockProc = createMockChildProcess(1234)
      mockSpawnFn.mockReturnValue(mockProc)

      vi.setSystemTime(1000)
      manager.spawn({
        taskId: "task-123",
        projectId: "proj-456",
        role: "dev",
        message: "Do work",
      })

      vi.setSystemTime(2000)
      const stdoutHandler = mockProc.stdout?.on as ReturnType<typeof vi.fn>
      const dataHandler = stdoutHandler.mock.calls.find((call) => call[0] === "data")?.[1]

      dataHandler(Buffer.from("hello"))

      const child = manager.get("task-123")
      expect(child?.lastOutput).toBe(2000)
      expect(child?.totalBytes).toBe(5)
    })

    it("should update lastOutput on stderr data", () => {
      const mockProc = createMockChildProcess(1234)
      mockSpawnFn.mockReturnValue(mockProc)

      vi.setSystemTime(1000)
      manager.spawn({
        taskId: "task-123",
        projectId: "proj-456",
        role: "dev",
        message: "Do work",
      })

      vi.setSystemTime(3000)
      const stderrHandler = mockProc.stderr?.on as ReturnType<typeof vi.fn>
      const dataHandler = stderrHandler.mock.calls.find((call) => call[0] === "data")?.[1]

      dataHandler(Buffer.from("error"))

      const child = manager.get("task-123")
      expect(child?.lastOutput).toBe(3000)
    })
  })

  describe("exit handling", () => {
    it("should set exitCode when process exits", () => {
      const mockProc = createMockChildProcess(1234)
      mockSpawnFn.mockReturnValue(mockProc)

      manager.spawn({
        taskId: "task-123",
        projectId: "proj-456",
        role: "dev",
        message: "Do work",
      })

      const onHandler = mockProc.on as ReturnType<typeof vi.fn>
      const exitHandler = onHandler.mock.calls.find((call) => call[0] === "exit")?.[1]

      exitHandler(0)

      const child = manager.get("task-123")
      expect(child?.exitCode).toBe(0)
    })

    it("should set exitCode to 1 when process exits with null code", () => {
      const mockProc = createMockChildProcess(1234)
      mockSpawnFn.mockReturnValue(mockProc)

      manager.spawn({
        taskId: "task-123",
        projectId: "proj-456",
        role: "dev",
        message: "Do work",
      })

      const onHandler = mockProc.on as ReturnType<typeof vi.fn>
      const exitHandler = onHandler.mock.calls.find((call) => call[0] === "exit")?.[1]

      exitHandler(null)

      const child = manager.get("task-123")
      expect(child?.exitCode).toBe(1)
    })
  })

  describe("active", () => {
    it("should return only non-exited processes", () => {
      const mockProc1 = createMockChildProcess(1234)
      const mockProc2 = createMockChildProcess(5678)
      mockSpawnFn.mockReturnValueOnce(mockProc1).mockReturnValueOnce(mockProc2)

      manager.spawn({
        taskId: "task-1",
        projectId: "proj-456",
        role: "dev",
        message: "Work 1",
      })
      manager.spawn({
        taskId: "task-2",
        projectId: "proj-456",
        role: "dev",
        message: "Work 2",
      })

      // Exit first process
      const onHandler = mockProc1.on as ReturnType<typeof vi.fn>
      const exitHandler = onHandler.mock.calls.find((call) => call[0] === "exit")?.[1]
      exitHandler(0)

      const active = manager.active()
      expect(active).toHaveLength(1)
      expect(active[0].taskId).toBe("task-2")
    })
  })

  describe("activeCount", () => {
    it("should return total active count when no project filter", () => {
      const mockProc1 = createMockChildProcess(1234)
      const mockProc2 = createMockChildProcess(5678)
      mockSpawnFn.mockReturnValueOnce(mockProc1).mockReturnValueOnce(mockProc2)

      manager.spawn({
        taskId: "task-1",
        projectId: "proj-a",
        role: "dev",
        message: "Work 1",
      })
      manager.spawn({
        taskId: "task-2",
        projectId: "proj-b",
        role: "dev",
        message: "Work 2",
      })

      expect(manager.activeCount()).toBe(2)
    })

    it("should return filtered count when projectId provided", () => {
      const mockProc1 = createMockChildProcess(1234)
      const mockProc2 = createMockChildProcess(5678)
      mockSpawnFn.mockReturnValueOnce(mockProc1).mockReturnValueOnce(mockProc2)

      manager.spawn({
        taskId: "task-1",
        projectId: "proj-a",
        role: "dev",
        message: "Work 1",
      })
      manager.spawn({
        taskId: "task-2",
        projectId: "proj-b",
        role: "dev",
        message: "Work 2",
      })

      expect(manager.activeCount("proj-a")).toBe(1)
      expect(manager.activeCount("proj-b")).toBe(1)
      expect(manager.activeCount("proj-c")).toBe(0)
    })
  })

  describe("reap", () => {
    it("should return completed children and remove from tracking", () => {
      const mockProc = createMockChildProcess(1234)
      mockSpawnFn.mockReturnValue(mockProc)

      vi.setSystemTime(1000)
      manager.spawn({
        taskId: "task-123",
        projectId: "proj-456",
        role: "dev",
        message: "Do work",
      })

      // Process exits
      const onHandler = mockProc.on as ReturnType<typeof vi.fn>
      const exitHandler = onHandler.mock.calls.find((call) => call[0] === "exit")?.[1]
      exitHandler(42)

      vi.setSystemTime(5000)
      const reaped = manager.reap()

      expect(reaped).toHaveLength(1)
      expect(reaped[0]).toEqual({
        taskId: "task-123",
        exitCode: 42,
        durationMs: 4000,
      })
      expect(manager.size()).toBe(0)
      expect(manager.get("task-123")).toBeUndefined()
    })

    it("should return empty array when no completed children", () => {
      const mockProc = createMockChildProcess(1234)
      mockSpawnFn.mockReturnValue(mockProc)

      manager.spawn({
        taskId: "task-123",
        projectId: "proj-456",
        role: "dev",
        message: "Do work",
      })

      const reaped = manager.reap()
      expect(reaped).toHaveLength(0)
      expect(manager.size()).toBe(1)
    })
  })

  describe("kill", () => {
    it("should send SIGTERM to active process", () => {
      const mockProc = createMockChildProcess(1234)
      mockSpawnFn.mockReturnValue(mockProc)

      manager.spawn({
        taskId: "task-123",
        projectId: "proj-456",
        role: "dev",
        message: "Do work",
      })

      manager.kill("task-123")

      expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM")
    })

    it("should not throw for unknown taskId", () => {
      expect(() => manager.kill("unknown")).not.toThrow()
    })

    it("should not kill already exited process", () => {
      const mockProc = createMockChildProcess(1234)
      mockSpawnFn.mockReturnValue(mockProc)

      manager.spawn({
        taskId: "task-123",
        projectId: "proj-456",
        role: "dev",
        message: "Do work",
      })

      // Process exits
      const onHandler = mockProc.on as ReturnType<typeof vi.fn>
      const exitHandler = onHandler.mock.calls.find((call) => call[0] === "exit")?.[1]
      exitHandler(0)

      manager.kill("task-123")

      expect(mockProc.kill).not.toHaveBeenCalled()
    })
  })

  describe("killAll", () => {
    it("should send SIGTERM to all active processes", () => {
      const mockProc1 = createMockChildProcess(1234)
      const mockProc2 = createMockChildProcess(5678)
      mockSpawnFn.mockReturnValueOnce(mockProc1).mockReturnValueOnce(mockProc2)

      manager.spawn({
        taskId: "task-1",
        projectId: "proj-456",
        role: "dev",
        message: "Work 1",
      })
      manager.spawn({
        taskId: "task-2",
        projectId: "proj-456",
        role: "dev",
        message: "Work 2",
      })

      manager.killAll()

      expect(mockProc1.kill).toHaveBeenCalledWith("SIGTERM")
      expect(mockProc2.kill).toHaveBeenCalledWith("SIGTERM")
    })

    it("should not kill already exited processes", () => {
      const mockProc1 = createMockChildProcess(1234)
      const mockProc2 = createMockChildProcess(5678)
      mockSpawnFn.mockReturnValueOnce(mockProc1).mockReturnValueOnce(mockProc2)

      manager.spawn({
        taskId: "task-1",
        projectId: "proj-456",
        role: "dev",
        message: "Work 1",
      })
      manager.spawn({
        taskId: "task-2",
        projectId: "proj-456",
        role: "dev",
        message: "Work 2",
      })

      // First process exits
      const onHandler = mockProc1.on as ReturnType<typeof vi.fn>
      const exitHandler = onHandler.mock.calls.find((call) => call[0] === "exit")?.[1]
      exitHandler(0)

      manager.killAll()

      expect(mockProc1.kill).not.toHaveBeenCalled()
      expect(mockProc2.kill).toHaveBeenCalledWith("SIGTERM")
    })
  })

  describe("stale", () => {
    it("should return children with no output for threshold period", () => {
      const mockProc = createMockChildProcess(1234)
      mockSpawnFn.mockReturnValue(mockProc)

      vi.setSystemTime(0)
      manager.spawn({
        taskId: "task-123",
        projectId: "proj-456",
        role: "dev",
        message: "Do work",
      })

      vi.setSystemTime(10000)
      const stale = manager.stale(5000)

      expect(stale).toHaveLength(1)
      expect(stale[0].taskId).toBe("task-123")
    })

    it("should not return active children under threshold", () => {
      const mockProc = createMockChildProcess(1234)
      mockSpawnFn.mockReturnValue(mockProc)

      vi.setSystemTime(0)
      manager.spawn({
        taskId: "task-123",
        projectId: "proj-456",
        role: "dev",
        message: "Do work",
      })

      vi.setSystemTime(1000)
      const stale = manager.stale(5000)

      expect(stale).toHaveLength(0)
    })

    it("should not return exited children", () => {
      const mockProc = createMockChildProcess(1234)
      mockSpawnFn.mockReturnValue(mockProc)

      vi.setSystemTime(0)
      manager.spawn({
        taskId: "task-123",
        projectId: "proj-456",
        role: "dev",
        message: "Do work",
      })

      // Process exits
      const onHandler = mockProc.on as ReturnType<typeof vi.fn>
      const exitHandler = onHandler.mock.calls.find((call) => call[0] === "exit")?.[1]
      exitHandler(0)

      vi.setSystemTime(10000)
      const stale = manager.stale(5000)

      expect(stale).toHaveLength(0)
    })
  })
})
