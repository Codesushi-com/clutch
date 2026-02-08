/**
 * Trap Channel Plugin for OpenClaw
 * 
 * Enables bidirectional communication between OpenClaw and the Trap UI.
 * 
 * How it works:
 *   1. Trap frontend sends messages via OpenClaw WebSocket (chat.send RPC)
 *   2. OpenClaw processes the message in the agent session
 *   3. On agent_end, this plugin detects trap:* session keys
 *   4. Extracts the assistant response and POSTs it to Trap API → Convex
 *   5. Convex reactive query updates the Trap UI
 * 
 * Session key format: trap:{projectSlug}:{chatId}
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

function getTrapUrl(api: OpenClawPluginApi): string {
  return api.config.env?.TRAP_URL || api.config.env?.TRAP_API_URL || "http://localhost:3002";
}

/**
 * Parse a trap session key into its components.
 * Format: trap:{projectSlug}:{chatId}
 */
function parseTrapSessionKey(sessionKey: string): { projectSlug: string; chatId: string } | null {
  const match = sessionKey.match(/^trap:([^:]+):(.+)$/);
  if (!match) return null;
  return { projectSlug: match[1], chatId: match[2] };
}

/**
 * Extract text content from an agent message.
 * Handles both string content and structured content arrays.
 */
function extractTextContent(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  
  const msg = message as Record<string, unknown>;
  const content = msg.content;
  
  if (typeof content === "string") return content;
  
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: string; text: string } => 
        c && typeof c === "object" && c.type === "text" && typeof c.text === "string"
      )
      .map(c => c.text)
      .join("\n\n");
  }
  
  return "";
}

async function sendToTrap(
  api: OpenClawPluginApi,
  chatId: string,
  content: string,
  options?: {
    runId?: string;
    sessionKey?: string;
    mediaUrl?: string;
    isAutomated?: boolean;
  }
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const trapUrl = getTrapUrl(api);
  const { runId, sessionKey, mediaUrl, isAutomated } = options || {};
  
  try {
    const body: Record<string, unknown> = {
      author: "ada",
      content: mediaUrl ? `${content}\n\n📎 ${mediaUrl}` : content,
      is_automated: isAutomated ?? false,
    };
    
    if (runId) body.run_id = runId;
    if (sessionKey) body.session_key = sessionKey;
    
    const response = await fetch(`${trapUrl}/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.status === 409) {
      // Duplicate run_id — message already saved (e.g. by frontend polling)
      api.logger.info(`Trap: message already saved (duplicate run_id: ${runId})`);
      return { ok: true };
    }

    if (!response.ok) {
      const error = await response.text();
      return { ok: false, error };
    }

    const data = await response.json();
    return { ok: true, messageId: data.message?.id };
  } catch (error) {
    return { 
      ok: false, 
      error: error instanceof Error ? error.message : "Failed to send to Trap" 
    };
  }
}

export default function register(api: OpenClawPluginApi) {
  // =========================================================================
  // agent_end hook — persist assistant responses to Trap/Convex
  // =========================================================================
  api.on("agent_end", async (event, ctx) => {
    const sessionKey = ctx.sessionKey;
    if (!sessionKey) return;
    
    // Only handle trap:* sessions
    const parsed = parseTrapSessionKey(sessionKey);
    if (!parsed) return;
    
    const { chatId } = parsed;
    
    if (!event.success) {
      api.logger.warn(`Trap: agent_end failed for chat ${chatId}: ${event.error}`);
      // Still clear typing indicator even on failure/abort
      const trapUrl = getTrapUrl(api);
      try {
        await fetch(`${trapUrl}/api/chats/${chatId}/typing`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ typing: false, author: "ada" }),
        });
      } catch (error) {
        api.logger.warn(`Trap: failed to clear typing after abort for chat ${chatId}: ${error}`);
      }
      return;
    }
    
    // Find the last assistant message in the transcript
    const messages = event.messages || [];
    let lastAssistantContent = "";
    
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as Record<string, unknown>;
      if (msg?.role === "assistant") {
        lastAssistantContent = extractTextContent(msg);
        break;
      }
    }
    
    const trimmed = lastAssistantContent.trim();
    if (!trimmed || trimmed === "NO_REPLY" || trimmed === "HEARTBEAT_OK") {
      api.logger.info(`Trap: no assistant content to save for chat ${chatId}`);
      // Still clear typing indicator
      const trapUrl2 = getTrapUrl(api);
      try {
        await fetch(`${trapUrl2}/api/chats/${chatId}/typing`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ typing: false, author: "ada" }),
        });
      } catch { /* ignore */ }
      return;
    }
    
    // POST the response to Trap API → Convex
    api.logger.info(`Trap: saving assistant response to chat ${chatId} (${lastAssistantContent.length} chars)`);
    const result = await sendToTrap(api, chatId, lastAssistantContent.trim(), {
      sessionKey,
      isAutomated: false,
    });
    
    if (result.ok) {
      api.logger.info(`Trap: response saved to chat ${chatId}`);
    } else {
      api.logger.warn(`Trap: failed to save response to chat ${chatId}: ${result.error}`);
    }

    // Clear typing indicator after response is saved
    const trapUrl = getTrapUrl(api);
    try {
      await fetch(`${trapUrl}/api/chats/${chatId}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typing: false, author: "ada" }),
      });
    } catch (error) {
      api.logger.warn(`Trap: failed to clear typing indicator for chat ${chatId}: ${error}`);
    }
  });

  // =========================================================================
  // Channel registration (for outbound messaging via message tool)
  // =========================================================================
  api.registerChannel({
    plugin: {
      id: "trap",
      meta: {
        id: "trap",
        label: "Trap",
        selectionLabel: "Trap",
        detailLabel: "Trap Orchestration",
        docsPath: "/channels/trap",
        blurb: "AI agent orchestration UI",
        order: 50,
      },
      capabilities: {
        chatTypes: ["direct", "group"],
      },
      config: {
        listAccountIds: () => ["default"],
        resolveAccount: () => ({ accountId: "default", valid: true }),
      },
      outbound: {
        deliveryMode: "direct",
        
        sendTypingIndicator: async (ctx) => {
          const { to, isTyping } = ctx;
          if (!to) return { ok: false, error: "No chat ID (to) provided" };

          const trapUrl = getTrapUrl(api);
          try {
            const response = await fetch(`${trapUrl}/api/chats/${to}/typing`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ typing: isTyping, author: "ada" }),
            });
            if (!response.ok) {
              api.logger.warn(`Trap: typing indicator failed - ${response.status}`);
              return { ok: false, error: `HTTP ${response.status}` };
            }
            return { ok: true };
          } catch (error) {
            api.logger.warn(`Trap: typing indicator error - ${error}`);
            return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
          }
        },
        
        sendText: async (ctx) => {
          const { to, text } = ctx;
          if (!to) return { ok: false, error: "No chat ID (to) provided" };

          api.logger.info(`Trap: sendText to chat ${to}`);
          const result = await sendToTrap(api, to, text);
          if (!result.ok) api.logger.warn(`Trap: sendText failed - ${result.error}`);
          return { ok: result.ok, messageId: result.messageId, error: result.error ? new Error(result.error) : undefined };
        },
        
        sendMedia: async (ctx) => {
          const { to, text, mediaUrl } = ctx;
          if (!to) return { ok: false, error: "No chat ID (to) provided" };

          api.logger.info(`Trap: sendMedia to chat ${to}`);
          const result = await sendToTrap(api, to, text || "📎 Attachment", { mediaUrl });
          if (!result.ok) api.logger.warn(`Trap: sendMedia failed - ${result.error}`);
          return { ok: result.ok, messageId: result.messageId, error: result.error ? new Error(result.error) : undefined };
        },
      },
    },
  });

  api.logger.info("Trap channel plugin loaded (with agent_end hook)");
}
