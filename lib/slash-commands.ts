/**
 * Slash Command Handler for OpenClutch Chat
 *
 * Intercepts messages starting with "/" and routes them to
 * OpenClaw gateway commands instead of sending as chat messages.
 */

import { resetSession, patchSession } from "@/lib/openclaw/api";

/** Available slash commands */
export const SLASH_COMMANDS = {
  new: {
    name: "/new",
    description: "Create a new chat with optional title",
    usage: "/new [title]",
    examples: ["/new", "/new Bug fix discussion", "/new Feature planning"],
  },
  issue: {
    name: "/issue",
    description: "Decompose a feature request into tasks with dependencies",
    usage: "/issue <description> [--project <slug>]",
    examples: [
      "/issue Add dark mode toggle",
      "/issue Implement user authentication --project myapp",
    ],
  },
  status: {
    name: "/status",
    description: "Show session status (model, tokens, context)",
    usage: "/status",
  },
  model: {
    name: "/model",
    description: "Switch to a different AI model",
    usage: "/model <model-name>",
    examples: ["/model kimi", "/model sonnet", "/model opus"],
  },
  help: {
    name: "/help",
    description: "Show available slash commands",
    usage: "/help",
  },
} as const;

/** Type for known command names */
export type SlashCommandName = keyof typeof SLASH_COMMANDS;

/** Result of parsing a slash command */
export interface SlashCommandResult {
  /** Whether the message is a recognized slash command */
  isCommand: boolean;
  /** Whether to send the message normally (for unknown / prefixed messages) */
  shouldSendMessage: boolean;
  /** The command name (without /) */
  command?: SlashCommandName | string;
  /** Command arguments */
  args: string[];
  /** Response to show in chat (null = no response) */
  response: string | null;
  /** Whether the response is an error */
  isError: boolean;
  /** Action to perform after showing response */
  action?: "clear_chat" | "refresh_session" | "create_chat" | null;
  /** Optional title for actions that create new resources (e.g., new chat) */
  title?: string;
}

/**
 * Parse a message to detect and extract slash commands.
 */
export function parseSlashCommand(message: string): Omit<SlashCommandResult, "response" | "isError" | "action"> {
  const trimmed = message.trim();

  // Not a slash command
  if (!trimmed.startsWith("/")) {
    return { isCommand: false, shouldSendMessage: true, args: [] };
  }

  // Parse command and args
  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1).filter(Boolean);

  // Check if it's a known command
  const knownCommands = Object.keys(SLASH_COMMANDS);
  const isKnown = knownCommands.includes(command);

  return {
    isCommand: true,
    shouldSendMessage: !isKnown, // Unknown /commands should still be sent as messages
    command,
    args,
  };
}

/**
 * Execute a slash command and return the result.
 *
 * @param command - The parsed command result
 * @param sessionKey - The current session key
 * @returns The command result with response
 */
export async function executeSlashCommand(
  command: Omit<SlashCommandResult, "response" | "isError" | "action">,
  sessionKey: string
): Promise<SlashCommandResult> {
  if (!command.isCommand) {
    return { ...command, response: null, isError: false, action: null };
  }

  const cmd = command.command as string;

  try {
    switch (cmd) {
      case "new":
        return await handleNewCommand(sessionKey, command.args);

      case "issue":
        return await handleIssueCommand(sessionKey, command.args);

      case "status":
        return await handleStatusCommand(sessionKey);

      case "model":
        return await handleModelCommand(sessionKey, command.args);

      case "help":
        return handleHelpCommand();

      default:
        // Unknown command - send as message with warning
        return {
          ...command,
          response: `⚠️ Unknown command "${cmd}". Type /help for available commands. Your message will be sent as normal.`,
          isError: false,
          action: null,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...command,
      response: `❌ Error executing /${cmd}: ${message}`,
      isError: true,
      action: null,
    };
  }
}

/**
 * Handle /new - Reset the session and create a new chat with optional title
 */
async function handleNewCommand(
  sessionKey: string,
  args: string[]
): Promise<SlashCommandResult> {
  const title = args.length > 0 ? args.join(" ") : undefined;
  await resetSession(sessionKey);

  const response = title
    ? `✨ New chat created: "${title}"`
    : "✨ New chat created.";

  return {
    isCommand: true,
    shouldSendMessage: false,
    command: "new",
    args,
    response,
    isError: false,
    action: "create_chat",
    title,
  };
}

/**
 * Handle /status - Show session status
 *
 * NOTE: Session status is now displayed in the chat header dropdown in real-time
 * via Convex reactive queries. This command directs users to the UI.
 */
async function handleStatusCommand(sessionKey: string): Promise<SlashCommandResult> {
  return {
    isCommand: true,
    shouldSendMessage: false,
    command: "status",
    args: [],
    response: `ℹ️ **Session status is now shown in the header.**\\n\\nClick the model name in the top-right (e.g., "kimi • 5%") to see:\\n• Current model and token usage\\n• Context window percentage\\n• Session actions (reset, compact)\\n\\nSession data updates in real-time via Convex.`,
    isError: false,
    action: null,
  };
}

/**
 * Handle /model - Switch models
 */
async function handleModelCommand(
  sessionKey: string,
  args: string[]
): Promise<SlashCommandResult> {
  if (args.length === 0) {
    return {
      isCommand: true,
      shouldSendMessage: false,
      command: "model",
      args,
      response: [
        "⚠️ **Usage:** `/model <model-name>`",
        "",
        "**Available models:**",
        "- `kimi` / `kimi-for-coding` - Moonshot Kimi (coding optimized)",
        "- `sonnet` - Claude Sonnet 4.5",
        "- `opus` - Claude Opus 4.6 (powerful, expensive)",
        "- `haiku` - Claude Haiku (fast, cheap)",
        "- `glm` - Z.AI GLM-4.7",
        "",
        "**Examples:**",
        "- `/model kimi`",
        "- `/model sonnet`",
      ].join("\n"),
      isError: false,
      action: null,
    };
  }

  const modelAlias = args[0].toLowerCase();

  // Map aliases to full model names
  const modelMap: Record<string, string> = {
    // Moonshot / Kimi
    kimi: "moonshot/kimi-for-coding",
    "kimi-for-coding": "moonshot/kimi-for-coding",
    "kimi-k2": "moonshot/kimi-k2-0905-preview",
    "kimi-k2-thinking": "moonshot/kimi-k2-thinking",

    // Anthropic / Claude
    sonnet: "anthropic/claude-sonnet-4-20250514",
    "claude-sonnet": "anthropic/claude-sonnet-4-20250514",
    opus: "anthropic/claude-opus-4-6",
    "claude-opus": "anthropic/claude-opus-4-6",
    haiku: "anthropic/claude-haiku-4-5",
    "claude-haiku": "anthropic/claude-haiku-4-5",

    // Z.AI / GLM
    glm: "zai/glm-4.7",
    "glm-4": "zai/glm-4.7",
    "glm-4.7": "zai/glm-4.7",
  };

  const model = modelMap[modelAlias] || modelAlias;

  // Validate model format (should contain a slash)
  if (!model.includes("/")) {
    return {
      isCommand: true,
      shouldSendMessage: false,
      command: "model",
      args,
      response: `⚠️ Unknown model "${modelAlias}". Use /model without arguments to see available models.`,
      isError: false,
      action: null,
    };
  }

  await patchSession(sessionKey, { model });

  return {
    isCommand: true,
    shouldSendMessage: false,
    command: "model",
    args,
    response: `✅ Model switched to **${model}**. Changes take effect on the next message.`,
    isError: false,
    action: "refresh_session",
  };
}

/**
 * Handle /help - Show available commands
 */
function handleHelpCommand(): SlashCommandResult {
  const commands = Object.entries(SLASH_COMMANDS).map(([, info]) => {
    return `- **${info.name}** - ${info.description}`;
  });

  const response = [
    "🤖 **Available Slash Commands**",
    "",
    ...commands,
    "",
    "Type any command to use it. Messages not starting with `/` are sent normally.",
  ].join("\n");

  return {
    isCommand: true,
    shouldSendMessage: false,
    command: "help",
    args: [],
    response,
    isError: false,
    action: null,
  };
}

/**
 * Handle /issue - Decompose a feature request into tasks with dependencies
 *
 * Spawns an isolated sub-agent session that:
 * 1. Parses and analyzes the request
 * 2. Asks clarifying questions if needed
 * 3. Researches the codebase (reads AGENTS.md, etc.)
 * 4. Creates well-scoped tasks via clutch CLI
 * 5. Sets up dependency chains via clutch tasks dep-add
 * 6. Reports back with the task breakdown
 */
async function handleIssueCommand(
  sessionKey: string,
  args: string[]
): Promise<SlashCommandResult> {
  if (args.length === 0) {
    return {
      isCommand: true,
      shouldSendMessage: false,
      command: "issue",
      args,
      response: [
        "⚠️ **Usage:** `/issue <description> [--project <slug>]`",
        "",
        "Decomposes a feature request into properly scoped tasks with dependency chains.",
        "",
        "**Examples:**",
        "- `/issue Add dark mode toggle to settings page`",
        "- `/issue Implement user authentication --project myapp`",
        "- `/issue Create API endpoint for user preferences`",
        "",
        "The agent will:",
        "1. Analyze your request and ask clarifying questions if needed",
        "2. Research the codebase to understand existing patterns",
        "3. Create well-scoped tasks with clear acceptance criteria",
        "4. Set up dependency chains (e.g., API before UI)",
        "5. Report back with the task breakdown and suggested order",
      ].join("\n"),
      isError: false,
      action: null,
    };
  }

  // Parse args to extract description and optional --project flag
  const description: string[] = [];
  let projectSlug: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--project" && i + 1 < args.length) {
      projectSlug = args[i + 1];
      i++; // Skip the next arg since we consumed it
    } else {
      description.push(arg);
    }
  }

  const descriptionText = description.join(" ");

  if (!descriptionText) {
    return {
      isCommand: true,
      shouldSendMessage: false,
      command: "issue",
      args,
      response: "⚠️ **Error:** Description is required. Use `/issue` without arguments for help.",
      isError: true,
      action: null,
    };
  }

  // Spawn a sub-agent to handle the decomposition
  // This runs asynchronously - the user gets immediate feedback
  try {
    const { openclawRpc } = await import("@/lib/openclaw/rpc");

    // Spawn an isolated sub-agent session for task decomposition
    await openclawRpc("sessions.spawn", {
      task: `You are a task decomposition specialist for Clutch. Your job is to break down a feature request into well-scoped, actionable tasks with proper dependency chains.

## User Request
"${descriptionText}"

${projectSlug ? `## Target Project\n${projectSlug}` : "## Project Detection\nInfer the project from the current working directory or context."}

## Your Mission

1. **Parse and Analyze**
   - Understand what the user wants at a high level
   - Identify the core components: backend, frontend, database, API, etc.
   - Determine if the request is too vague or broad

2. **Ask Clarifying Questions (if needed)**
   - If anything is unclear or ambiguous, ask the user before proceeding
   - Push back if the request is too broad for a single decomposition
   - Use your judgment - don't guess on critical details

3. **Research the Codebase**
   - Read AGENTS.md to understand project conventions
   - Browse relevant source files to understand existing patterns
   - Look at similar features for reference
   - Understand the tech stack and architecture

4. **Create Tasks**
   For each task, create a Clutch task using the CLI:
   \`\`\`bash
   clutch tasks create --title "Task title" --description 'Detailed description with acceptance criteria' --priority <low|medium|high|urgent> --role <pm|dev|research|reviewer|conflict_resolver>
   \`\`\`

   Each task should have:
   - Clear, specific title
   - Detailed description with acceptance criteria
   - Appropriate priority (most tasks should be medium or high)
   - Appropriate role (usually "dev" for implementation tasks)

5. **Set Up Dependencies**
   After creating tasks, establish dependencies using:
   \`\`\`bash
   clutch tasks dep-add <task-id> --on <dependency-task-id>
   \`\`\`

   Dependencies should reflect real build order:
   - API endpoints must exist before UI calls them
   - Database migrations before code that uses new tables
   - Shared components before features that use them

6. **Report Back**
   Provide a summary including:
   - List of created tasks with IDs
   - Dependency graph (what depends on what)
   - Suggested priority/ordering
   - Any assumptions made
   - Any questions that still need answers

## Important Guidelines

- Tasks should be granular enough to be completed in a few hours to a day
- Don't create monolithic "implement everything" tasks
- Frontend and backend work should usually be separate tasks
- Include testing/QA tasks where appropriate
- Consider documentation tasks for user-facing features
- If research is needed first, create a research task as the first dependency

## Tool Access

You have access to:
- \`clutch\` CLI for task management
- File system for researching the codebase
- All standard OpenClaw tools

Start by checking if you need clarification, then research, then create tasks.`,
      agentId: "issue-decomposer",
      label: `issue:${descriptionText.slice(0, 40)}`,
      model: "anthropic/claude-sonnet-4-20250514", // Use sonnet for cost-effective planning
      thinking: "on", // Enable thinking for better decomposition
      runTimeoutSeconds: 600, // 10 minutes for complex decompositions
      cleanup: "delete", // Clean up after completion
    });

    return {
      isCommand: true,
      shouldSendMessage: false,
      command: "issue",
      args,
      response: [
        "🚀 **Task decomposition started**",
        "",
        `**Request:** ${descriptionText}`,
        ...(projectSlug ? [`**Project:** ${projectSlug}`] : []),
        "",
        "I've spawned a specialized agent to break this down into well-scoped tasks with dependencies. This may take a minute or two.",
        "",
        "The agent will:",
        "1. Research the codebase to understand existing patterns",
        "2. Create granular, actionable tasks",
        "3. Set up proper dependency chains",
        "4. Report back with the full breakdown",
        "",
        "You'll see the results in the chat when complete.",
      ].join("\n"),
      isError: false,
      action: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isCommand: true,
      shouldSendMessage: false,
      command: "issue",
      args,
      response: `❌ Failed to start task decomposition: ${message}`,
      isError: true,
      action: null,
    };
  }
}

/**
 * Get context window size for a model.
 */
function getModelContextWindow(model: string): number {
  const lowerModel = model.toLowerCase();

  // Anthropic models
  if (lowerModel.includes("claude-opus-4-6")) return 200000;
  if (lowerModel.includes("claude-opus-4-5")) return 200000;
  if (lowerModel.includes("claude-opus")) return 200000;
  if (lowerModel.includes("claude-sonnet-4")) return 200000;
  if (lowerModel.includes("claude-sonnet")) return 200000;
  if (lowerModel.includes("claude-haiku")) return 200000;
  if (lowerModel.includes("claude")) return 200000;

  // Moonshot / Kimi models
  if (lowerModel.includes("kimi-k2-thinking") || lowerModel.includes("kimi-k2.5-thinking"))
    return 131072;
  if (lowerModel.includes("kimi-k2")) return 256000;
  if (lowerModel.includes("kimi-for-coding")) return 262144;
  if (lowerModel.includes("kimi")) return 200000;
  if (lowerModel.includes("moonshot")) return 200000;

  // OpenAI models
  if (lowerModel.includes("gpt-4.5")) return 128000;
  if (lowerModel.includes("gpt-4o")) return 128000;
  if (lowerModel.includes("gpt-4-turbo")) return 128000;
  if (lowerModel.includes("gpt-4")) return 8192;
  if (lowerModel.includes("gpt-3.5-turbo")) return 16385;
  if (lowerModel.includes("gpt-3.5")) return 4096;
  if (lowerModel.includes("gpt-5")) return 128000;

  // Google models
  if (lowerModel.includes("gemini-1.5-pro")) return 2000000;
  if (lowerModel.includes("gemini-1.5-flash")) return 1000000;
  if (lowerModel.includes("gemini-1.5")) return 1000000;
  if (lowerModel.includes("gemini")) return 1000000;

  // Z.AI / GLM models
  if (lowerModel.includes("glm-4.5")) return 128000;
  if (lowerModel.includes("glm-4")) return 128000;
  if (lowerModel.includes("glm")) return 128000;

  // MiniMax models
  if (lowerModel.includes("minimax")) return 1000000;

  // Default fallback for unknown models (assume 128k)
  return 128000;
}