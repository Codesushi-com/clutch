/**
 * Trap Channel Plugin for OpenClaw
 * 
 * Enables bidirectional communication between OpenClaw and the Trap UI.
 * 
 * Install:
 *   ln -s /home/dan/src/trap/plugins/trap-channel.ts ~/.openclaw/extensions/
 * 
 * Outbound: Plugin POSTs to Trap API when agent responds
 * Inbound: Trap POSTs to OpenClaw /hooks/agent endpoint
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const TRAP_API_URL = process.env.TRAP_API_URL || "http://localhost:3002";

async function sendToTrap(chatId: string, content: string, mediaUrl?: string): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const response = await fetch(`${TRAP_API_URL}/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author: "ada",
        content: mediaUrl ? `${content}\n\n📎 ${mediaUrl}` : content,
      }),
    });

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
        
        // Send typing indicator to Trap chat
        sendTypingIndicator: async (ctx) => {
          const { to, isTyping } = ctx;
          
          if (!to) {
            return { ok: false, error: "No chat ID (to) provided" };
          }

          try {
            const response = await fetch(`${TRAP_API_URL}/api/chats/${to}/typing`, {
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
            return { 
              ok: false, 
              error: error instanceof Error ? error.message : "Unknown error" 
            };
          }
        },
        
        // Send text message to Trap chat
        sendText: async (ctx) => {
          const { to, text } = ctx;
          
          if (!to) {
            return { ok: false, error: "No chat ID (to) provided" };
          }

          api.logger.info(`Trap: sending text to chat ${to}`);
          const result = await sendToTrap(to, text);
          
          if (!result.ok) {
            api.logger.warn(`Trap: failed to send - ${result.error}`);
          }
          
          return { 
            ok: result.ok, 
            messageId: result.messageId,
            error: result.error ? new Error(result.error) : undefined,
          };
        },
        
        // Send media to Trap chat (include URL in message)
        sendMedia: async (ctx) => {
          const { to, text, mediaUrl } = ctx;
          
          if (!to) {
            return { ok: false, error: "No chat ID (to) provided" };
          }

          api.logger.info(`Trap: sending media to chat ${to}`);
          const result = await sendToTrap(to, text || "📎 Attachment", mediaUrl);
          
          if (!result.ok) {
            api.logger.warn(`Trap: failed to send media - ${result.error}`);
          }
          
          return { 
            ok: result.ok, 
            messageId: result.messageId,
            error: result.error ? new Error(result.error) : undefined,
          };
        },
      },
    },
  });

  api.logger.info("Trap channel plugin loaded");
}
