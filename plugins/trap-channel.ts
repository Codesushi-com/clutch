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

function getTrapUrl(api: OpenClawPluginApi): string {
  return api.config.env?.TRAP_URL || api.config.env?.TRAP_API_URL || "http://localhost:3002";
}

function detectAutomatedContext(api: OpenClawPluginApi, chatId: string): boolean {
  // Check environment variables that indicate automated execution
  const env = api.config.env || {};
  
  // Check if this is a cron job execution
  if (env.CRON_JOB_ID || env.CRON_NAME || env.AUTOMATED_RUN) {
    return true;
  }
  
  // Check for cron-specific indicators in the chat ID or session context
  // Cron sessions typically have identifiable patterns in their IDs
  if (chatId && typeof chatId === 'string') {
    // Check if the chat ID contains cron-related patterns
    if (chatId.includes('cron:') || chatId.includes(':cron') || 
        chatId.includes('automated') || chatId.includes('background')) {
      return true;
    }
    
    // Check for sub-agent session patterns (which are often spawned by cron)
    if (chatId.includes('trap:') && chatId.includes('-')) {
      // This might be a sub-agent session ID pattern
      return true;
    }
  }
  
  // Check for runtime flags that might indicate automation
  const runtime = api.runtime || {};
  if (runtime && typeof runtime === 'object') {
    // Check if there are any automation indicators in runtime
    const runtimeStr = JSON.stringify(runtime).toLowerCase();
    if (runtimeStr.includes('cron') || runtimeStr.includes('automated') || runtimeStr.includes('background')) {
      return true;
    }
  }
  
  // Default to false for interactive sessions
  return false;
}

async function sendToTrap(
  api: OpenClawPluginApi,
  chatId: string,
  content: string,
  options?: {
    mediaUrl?: string;
    isAutomated?: boolean;
  }
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const trapUrl = getTrapUrl(api);
  const { mediaUrl, isAutomated } = options || {};
  
  // If isAutomated is explicitly provided, use it; otherwise detect from context
  const shouldMarkAsAutomated = isAutomated !== undefined ? isAutomated : detectAutomatedContext(api, chatId);
  
  try {
    const response = await fetch(`${trapUrl}/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author: "ada",
        content: mediaUrl ? `${content}\n\n📎 ${mediaUrl}` : content,
        is_automated: shouldMarkAsAutomated,
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
            return { 
              ok: false, 
              error: error instanceof Error ? error.message : "Unknown error" 
            };
          }
        },
        
        // Send text message to Trap chat
        // Automation status is now detected automatically based on execution context
        sendText: async (ctx) => {
          const { to, text } = ctx;
          
          if (!to) {
            return { ok: false, error: "No chat ID (to) provided" };
          }

          api.logger.info(`Trap: sending text to chat ${to}`);
          const result = await sendToTrap(api, to, text);
          
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
          const result = await sendToTrap(api, to, text || "📎 Attachment", { mediaUrl });
          
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
