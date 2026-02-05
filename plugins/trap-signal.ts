/**
 * Trap Signal Plugin for OpenClaw
 * 
 * Provides the `signal` tool for agent-to-coordinator communication.
 * Agents can request input, escalate issues, or send FYI notifications.
 * 
 * Installation:
 *   1. Symlink: ln -s /path/to/trap/plugins/trap-signal.ts ~/.openclaw/extensions/
 *   2. Or add to openclaw.json: { "plugins": ["/path/to/trap/plugins/trap-signal.ts"] }
 * 
 * Configuration:
 *   Set TRAP_URL environment variable (default: http://localhost:3002)
 */

// Types from OpenClaw (declared here since module isn't available at build time)
type OpenClawPluginToolContext = {
  sessionKey?: string;
  agentId?: string;
};

type OpenClawPluginTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: unknown) => Promise<unknown>;
};

type OpenClawPluginApi = {
  registerTool: (tool: OpenClawPluginTool | ((ctx: OpenClawPluginToolContext) => OpenClawPluginTool), opts?: { optional?: boolean }) => void;
  logger: { info: (msg: string) => void };
};

const TRAP_URL = process.env.TRAP_URL || "http://localhost:3002";

interface SignalParams {
  taskId: string;
  kind: "question" | "blocker" | "alert" | "fyi";
  message: string;
  severity?: "normal" | "urgent" | "critical";
}

interface SignalResponse {
  signalId: string;
  blocking: boolean;
  signal?: {
    id: string;
    kind: string;
    message: string;
  };
  error?: string;
}

export default function register(api: OpenClawPluginApi) {
  // Register the signal tool as a factory (to get session context)
  api.registerTool(
    (ctx: OpenClawPluginToolContext) => ({
      name: "signal",
      description: `Signal the coordinator (Ada) for help or to report status.

Use this when you need input, are blocked, or want to escalate an issue.

Kinds:
- question: Ask a question, wait for answer before continuing
- blocker: Report something blocking progress, wait for resolution  
- alert: Flag an issue for attention, wait for acknowledgment
- fyi: Informational only, continue without waiting

Examples:
- signal({taskId: "abc", kind: "question", message: "Should timeout be env var or config?"})
- signal({taskId: "abc", kind: "alert", severity: "critical", message: "Found hardcoded credentials"})
- signal({taskId: "abc", kind: "fyi", message: "Refactored auth module while fixing bug"})`,
      parameters: {
        type: "object" as const,
        properties: {
          taskId: {
            type: "string",
            description: "The task ID this signal relates to",
          },
          kind: {
            type: "string",
            enum: ["question", "blocker", "alert", "fyi"],
            description: "Type of signal: question (need answer), blocker (stuck), alert (attention needed), fyi (informational)",
          },
          message: {
            type: "string",
            description: "Your message to the coordinator",
          },
          severity: {
            type: "string",
            enum: ["normal", "urgent", "critical"],
            description: "Severity level for alerts (default: normal)",
          },
        },
        required: ["taskId", "kind", "message"],
      },
      execute: async (params: SignalParams): Promise<SignalResponse | { error: string }> => {
        try {
          const response = await fetch(`${TRAP_URL}/api/signal`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              taskId: params.taskId,
              kind: params.kind,
              message: params.message,
              severity: params.severity || "normal",
              sessionKey: ctx.sessionKey,
              agentId: ctx.agentId || "unknown",
            }),
          });

          if (!response.ok) {
            const error = await response.json().catch(() => ({ error: "Unknown error" }));
            return { error: error.error || `HTTP ${response.status}` };
          }

          const result = await response.json() as SignalResponse;
          
          // Return guidance based on blocking status
          if (result.blocking) {
            return {
              ...result,
              _guidance: "Signal sent. WAIT for coordinator response before continuing. The response will arrive as a message in this session.",
            } as SignalResponse & { _guidance: string };
          } else {
            return {
              ...result,
              _guidance: "FYI noted. You may continue with your work.",
            } as SignalResponse & { _guidance: string };
          }
        } catch (err) {
          return {
            error: `Failed to send signal: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    }),
    { optional: true }
  );

  // Register mark_complete tool
  api.registerTool(
    (ctx: OpenClawPluginToolContext) => ({
      name: "mark_complete",
      description: `Mark a task as complete with a summary of work done.

Call this when you've finished the task. Include:
- A summary of what was accomplished
- PR URL if you created one (task will go to "review" status)
- Any notes or caveats

Example:
mark_complete({
  taskId: "abc",
  summary: "Implemented signal API with POST/GET endpoints",
  prUrl: "https://github.com/user/repo/pull/123",
  notes: "Also fixed a bug in the gate endpoint"
})`,
      parameters: {
        type: "object" as const,
        properties: {
          taskId: {
            type: "string",
            description: "The task ID to mark complete",
          },
          summary: {
            type: "string",
            description: "Summary of work completed",
          },
          prUrl: {
            type: "string",
            description: "Pull request URL if one was created",
          },
          notes: {
            type: "string",
            description: "Any additional notes or caveats",
          },
        },
        required: ["taskId", "summary"],
      },
      execute: async (params: { taskId: string; summary: string; prUrl?: string; notes?: string }) => {
        try {
          const response = await fetch(`${TRAP_URL}/api/tasks/${params.taskId}/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              summary: params.summary,
              prUrl: params.prUrl,
              notes: params.notes,
              agent: ctx.agentId || "unknown",
            }),
          });

          if (!response.ok) {
            const error = await response.json().catch(() => ({ error: "Unknown error" }));
            return { error: error.error || `HTTP ${response.status}` };
          }

          const result = await response.json();
          return {
            success: true,
            status: result.task?.status,
            message: result.task?.status === "review" 
              ? "Task marked complete and moved to review (PR submitted)."
              : "Task marked complete and moved to done.",
          };
        } catch (err) {
          return {
            error: `Failed to mark complete: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    }),
    { optional: true }
  );

  api.logger.info(`Trap plugin loaded (TRAP_URL=${TRAP_URL})`);
}
