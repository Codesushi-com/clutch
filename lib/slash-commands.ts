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