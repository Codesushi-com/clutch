/**
 * Clutch Channel Plugin for OpenClaw
 *
 * Enables bidirectional communication between OpenClaw and the Clutch UI.
 *
 * How it works:
 *   1. Clutch frontend sends messages via OpenClaw WebSocket (chat.send RPC)
 *   2. OpenClaw processes the message in the agent session
 *   3. Plugin tracks agent lifecycle events and updates message delivery status
 *   4. On agent_end, posts assistant responses back to Clutch API → Convex
 *   5. Convex reactive query updates the Clutch UI
 *
 * Session key format: clutch:{projectSlug}:{chatId}
 * 
 * Message correlation strategy (FIFO):
 *   - message_received: Mark oldest "sent" message as "delivered"
 *   - agent_start: Mark oldest "delivered" message as "processing"  
 *   - agent_end: Mark oldest "processing" message as "responded"/"failed"
 *   - This ensures each message independently tracks its status, avoiding race conditions
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

function getClutchUrl(api: OpenClawPluginApi): string {
  return api.config.env?.CLUTCH_URL || api.config.env?.CLUTCH_API_URL || "http://localhost:3002";
}

/**
 * Parse a clutch session key into its components.
 * Format: clutch:{projectSlug}:{chatId}
 */
function parseClutchSessionKey(sessionKey: string): { projectSlug: string; chatId: string } | null {
  const match = sessionKey.match(/^clutch:([^:]+):(.+)$/);
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
      .filter(
        (c): c is { type: string; text: string } =>
          c && typeof c === "object" && c.type === "text" && typeof c.text === "string"
      )
      .map((c) => c.text)
      .join("\n\n");
  }

  return "";
}

/**
 * Update message delivery status in Clutch
 */
async function updateMessageStatus(
  api: OpenClawPluginApi,
  chatId: string,
  messageId: string,
  status: "sent" | "delivered" | "processing" | "responded" | "failed",
  retryCount?: number,
  cooldownUntil?: number,
  failureReason?: string
): Promise<{ ok: boolean; error?: string }> {
  const clutchUrl = getClutchUrl(api);

  try {
    const body: Record<string, unknown> = { 
      delivery_status: status 
    };
    
    if (retryCount !== undefined) body.retry_count = retryCount;
    if (cooldownUntil !== undefined) body.cooldown_until = cooldownUntil;
    if (failureReason !== undefined) body.failure_reason = failureReason;

    const response = await fetch(`${clutchUrl}/api/chats/${chatId}/messages/${messageId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      return { ok: false, error: `HTTP ${response.status}: ${error}` };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update status",
    };
  }
}

/**
 * Get the oldest human message with "sent" status (FIFO for message_received)
 */
async function getOldestSentMessage(
  api: OpenClawPluginApi,
  chatId: string
): Promise<{ id: string; delivery_status?: string } | null> {
  const clutchUrl = getClutchUrl(api);

  try {
    const response = await fetch(`${clutchUrl}/api/chats/${chatId}/oldest-sent-message`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      api.logger.warn(`Clutch: failed to get oldest sent message for chat ${chatId}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.message;
  } catch (error) {
    api.logger.warn(`Clutch: error getting oldest sent message for chat ${chatId}: ${error}`);
    return null;
  }
}

/**
 * Get the oldest human message with "delivered" status (FIFO for agent_start)
 */
async function getOldestDeliveredMessage(
  api: OpenClawPluginApi,
  chatId: string
): Promise<{ id: string; delivery_status?: string } | null> {
  const clutchUrl = getClutchUrl(api);

  try {
    const response = await fetch(`${clutchUrl}/api/chats/${chatId}/oldest-delivered-message`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      api.logger.warn(`Clutch: failed to get oldest delivered message for chat ${chatId}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.message;
  } catch (error) {
    api.logger.warn(`Clutch: error getting oldest delivered message for chat ${chatId}: ${error}`);
    return null;
  }
}

/**
 * Get the oldest human message with "processing" status (FIFO for agent_end)
 */
async function getOldestProcessingMessage(
  api: OpenClawPluginApi,
  chatId: string
): Promise<{ id: string; delivery_status?: string } | null> {
  const clutchUrl = getClutchUrl(api);

  try {
    const response = await fetch(`${clutchUrl}/api/chats/${chatId}/oldest-processing-message`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      api.logger.warn(`Clutch: failed to get oldest processing message for chat ${chatId}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.message;
  } catch (error) {
    api.logger.warn(`Clutch: error getting oldest processing message for chat ${chatId}: ${error}`);
    return null;
  }
}

/**
 * Get the latest human message from a chat (for status updates and cooldown retry)
 */
async function getLatestHumanMessage(
  api: OpenClawPluginApi,
  chatId: string
): Promise<{ id: string; delivery_status?: string } | null> {
  const clutchUrl = getClutchUrl(api);

  try {
    const response = await fetch(`${clutchUrl}/api/chats/${chatId}/latest-human-message`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      api.logger.warn(`Clutch: failed to get latest human message for chat ${chatId}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.message;
  } catch (error) {
    api.logger.warn(`Clutch: error getting latest human message for chat ${chatId}: ${error}`);
    return null;
  }
}

async function sendToClutch(
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
  const clutchUrl = getClutchUrl(api);
  const { runId, sessionKey, mediaUrl, isAutomated } = options || {};

  try {
    const body: Record<string, unknown> = {
      author: "ada",
      content: mediaUrl ? `${content}\n\n📎 ${mediaUrl}` : content,
      is_automated: isAutomated ?? false,
    };

    if (runId) body.run_id = runId;
    if (sessionKey) body.session_key = sessionKey;

    const response = await fetch(`${clutchUrl}/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.status === 409) {
      // Duplicate run_id — message already saved (e.g. by frontend polling)
      api.logger.info(`Clutch: message already saved (duplicate run_id: ${runId})`);
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
      error: error instanceof Error ? error.message : "Failed to send to Clutch",
    };
  }
}

/**
 * Configuration for message recovery and monitoring
 */
const RECOVERY_CONFIG = {
  STARTUP_RECOVERY_THRESHOLD_MINUTES: 5,
  RETRY_THRESHOLD_MINUTES: 5,
  HEARTBEAT_INTERVAL_MS: 30 * 1000, // 30 seconds
  PROCESSING_TIMEOUT_MS: 3 * 60 * 1000, // 3 minutes
  DELIVERED_TIMEOUT_MS: 30 * 1000, // 30 seconds
  MAX_RETRY_ATTEMPTS: 3,
};

/**
 * Handle resilience after gateway restart/reconnect
 */
async function handleStartupRecovery(api: OpenClawPluginApi): Promise<void> {
  const clutchUrl = getClutchUrl(api);

  try {
    api.logger.info("Clutch: performing startup recovery check...");

    // Use the new bulk recovery API
    const response = await fetch(`${clutchUrl}/api/chats/messages/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        age_threshold_minutes: RECOVERY_CONFIG.STARTUP_RECOVERY_THRESHOLD_MINUTES,
        action: "mark_failed"
      }),
    });

    if (!response.ok) {
      api.logger.warn(`Clutch: startup recovery failed: HTTP ${response.status}`);
      return;
    }

    const data = await response.json();
    api.logger.info(`Clutch: startup recovery completed - processed ${data.processed} stuck messages`);
    
    if (data.processed > 0) {
      api.logger.info(`Clutch: marked ${data.processed} messages as failed, added system messages to ${data.results[0]?.system_messages_added || 0} chats`);
    }
  } catch (error) {
    api.logger.warn(`Clutch: error during startup recovery: ${error}`);
  }
}

/**
 * Heartbeat monitoring for in-flight messages
 */
async function startHeartbeatMonitoring(api: OpenClawPluginApi): Promise<void> {
  const clutchUrl = getClutchUrl(api);

  async function checkStuckMessages() {
    try {
      // Check for messages stuck longer than timeout thresholds
      const response = await fetch(`${clutchUrl}/api/chats/messages/stuck?age_minutes=1&limit=50`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        api.logger.warn(`Clutch: heartbeat check failed: HTTP ${response.status}`);
        return;
      }

      const data = await response.json();
      const stuckMessages = data.messages || [];

      for (const msg of stuckMessages) {
        const age = msg.age_ms;
        const status = msg.delivery_status;
        
        // Different timeout thresholds for different states
        let shouldTimeout = false;
        let timeoutReason = "";

        if (status === "processing" && age > RECOVERY_CONFIG.PROCESSING_TIMEOUT_MS) {
          shouldTimeout = true;
          timeoutReason = "processing timeout (agent may be stuck)";
        } else if (status === "delivered" && age > RECOVERY_CONFIG.DELIVERED_TIMEOUT_MS) {
          shouldTimeout = true;
          timeoutReason = "delivery timeout (agent didn't start processing)";
        } else if (status === "sent" && age > RECOVERY_CONFIG.RETRY_THRESHOLD_MINUTES * 60 * 1000) {
          // For "sent" messages, try retry first if under retry limit
          const retryCount = msg.retry_count || 0;
          if (retryCount < RECOVERY_CONFIG.MAX_RETRY_ATTEMPTS) {
            api.logger.info(`Clutch: retrying stuck message ${msg.id} (attempt ${retryCount + 1})`);
            await retryMessage(api, msg.chat_id, msg.id);
          } else {
            shouldTimeout = true;
            timeoutReason = "max retries exceeded";
          }
        }

        if (shouldTimeout) {
          api.logger.info(`Clutch: timing out message ${msg.id} due to ${timeoutReason} (age: ${Math.round(age/1000)}s)`);
          await updateMessageStatus(api, msg.chat_id, msg.id, "failed", undefined, undefined, timeoutReason);
        }
      }
    } catch (error) {
      api.logger.warn(`Clutch: heartbeat monitoring error: ${error}`);
    }
  }

  // Start the heartbeat monitoring
  api.logger.info(`Clutch: starting heartbeat monitoring (interval: ${RECOVERY_CONFIG.HEARTBEAT_INTERVAL_MS}ms)`);
  setInterval(checkStuckMessages, RECOVERY_CONFIG.HEARTBEAT_INTERVAL_MS);
}

/**
 * Retry a specific message
 */
async function retryMessage(api: OpenClawPluginApi, chatId: string, messageId: string): Promise<boolean> {
  const clutchUrl = getClutchUrl(api);

  try {
    // This will increment retry_count and reset delivery_status to "sent"
    const response = await fetch(`${clutchUrl}/api/chats/${chatId}/messages/${messageId}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      api.logger.warn(`Clutch: retry failed for message ${messageId}: HTTP ${response.status}`);
      return false;
    }

    api.logger.info(`Clutch: successfully retried message ${messageId}`);
    return true;
  } catch (error) {
    api.logger.warn(`Clutch: retry error for message ${messageId}: ${error}`);
    return false;
  }
}

/**
 * Handle cooldown/rate limit responses from the gateway
 */
async function handleCooldown(api: OpenClawPluginApi, chatId: string, messageId: string, cooldownMs: number): Promise<void> {
  const cooldownUntil = Date.now() + cooldownMs;
  
  api.logger.info(`Clutch: message ${messageId} in cooldown for ${Math.round(cooldownMs/1000)}s`);
  
  // Update message with cooldown timestamp (keeps it in "sent" state)
  await updateMessageStatus(api, chatId, messageId, "sent", undefined, cooldownUntil, "waiting for model availability");
  
  // Schedule auto-retry when cooldown expires
  setTimeout(async () => {
    try {
      // Check if message still needs retry
      const latestMessage = await getLatestHumanMessage(api, chatId);
      if (latestMessage && latestMessage.id === messageId && latestMessage.delivery_status === "sent") {
        api.logger.info(`Clutch: auto-retrying message ${messageId} after cooldown`);
        await retryMessage(api, chatId, messageId);
      }
    } catch (error) {
      api.logger.warn(`Clutch: auto-retry after cooldown failed for message ${messageId}: ${error}`);
    }
  }, cooldownMs);
}

export default function register(api: OpenClawPluginApi) {
  // =========================================================================
  // Plugin initialization - handle restart resilience and monitoring
  // =========================================================================
  api.logger.info("Clutch channel plugin loading with enhanced message recovery...");
  
  // Handle startup recovery after a brief delay
  setTimeout(() => handleStartupRecovery(api), 2000);
  
  // Start heartbeat monitoring for in-flight messages
  setTimeout(() => startHeartbeatMonitoring(api), 5000);

  // =========================================================================
  // message_received hook — update oldest "sent" message to "delivered" (FIFO)
  // =========================================================================
  api.on("message_received", async (event, ctx) => {
    const sessionKey = ctx.sessionKey;
    if (!sessionKey) return;

    const parsed = parseClutchSessionKey(sessionKey);
    if (!parsed) return;

    const { chatId } = parsed;

    // Find the oldest human message with "sent" status and mark as delivered (FIFO)
    const oldestSentMessage = await getOldestSentMessage(api, chatId);
    
    if (oldestSentMessage && oldestSentMessage.delivery_status === "sent") {
      api.logger.info(`Clutch: marking oldest sent message ${oldestSentMessage.id} as delivered (FIFO)`);
      const result = await updateMessageStatus(api, chatId, oldestSentMessage.id, "delivered");
      
      if (!result.ok) {
        api.logger.warn(`Clutch: failed to mark message ${oldestSentMessage.id} as delivered: ${result.error}`);
      }
    }
  });

  // =========================================================================
  // agent_start hook — update oldest "delivered" message to "processing" (FIFO)
  // =========================================================================
  api.on("agent_start", async (event, ctx) => {
    const sessionKey = ctx.sessionKey;
    if (!sessionKey) return;

    const parsed = parseClutchSessionKey(sessionKey);
    if (!parsed) return;

    const { chatId } = parsed;

    // Find the oldest human message with "delivered" status and mark as processing (FIFO)
    const oldestDeliveredMessage = await getOldestDeliveredMessage(api, chatId);
    
    if (oldestDeliveredMessage && oldestDeliveredMessage.delivery_status === "delivered") {
      api.logger.info(`Clutch: marking oldest delivered message ${oldestDeliveredMessage.id} as processing (FIFO)`);
      const result = await updateMessageStatus(api, chatId, oldestDeliveredMessage.id, "processing");
      
      if (!result.ok) {
        api.logger.warn(`Clutch: failed to mark message ${oldestDeliveredMessage.id} as processing: ${result.error}`);
      }
    }
  });

  // =========================================================================
  // agent_end hook — persist assistant responses and update to "responded"/"failed"
  // =========================================================================
  api.on("agent_end", async (event, ctx) => {
    const sessionKey = ctx.sessionKey;
    if (!sessionKey) return;

    // Only handle clutch:* sessions
    const parsed = parseClutchSessionKey(sessionKey);
    if (!parsed) return;

    const { chatId } = parsed;

    // Get the oldest processing message for status update (FIFO)
    const processingMessage = await getOldestProcessingMessage(api, chatId);

    if (!event.success) {
      const errorMessage = event.error || "Unknown error";
      api.logger.warn(`Clutch: agent_end failed for chat ${chatId}: ${errorMessage}`);
      
      // Check if this is a cooldown/rate limit error
      const isCooldownError = errorMessage.includes("cooldown") || 
                             errorMessage.includes("rate limit") || 
                             errorMessage.includes("too many requests");
      
      if (isCooldownError && processingMessage) {
        // Extract cooldown duration if available (basic parsing)
        const cooldownMatch = errorMessage.match(/(\d+)\s*(second|minute|hour)s?/i);
        let cooldownMs = 60000; // Default 1 minute
        
        if (cooldownMatch) {
          const value = parseInt(cooldownMatch[1]);
          const unit = cooldownMatch[2].toLowerCase();
          if (unit.startsWith("second")) cooldownMs = value * 1000;
          else if (unit.startsWith("minute")) cooldownMs = value * 60 * 1000;
          else if (unit.startsWith("hour")) cooldownMs = value * 60 * 60 * 1000;
        }
        
        api.logger.info(`Clutch: detected cooldown for chat ${chatId}, duration: ${cooldownMs}ms`);
        await handleCooldown(api, chatId, processingMessage.id, cooldownMs);
      } else if (processingMessage) {
        // Regular failure
        const failureReason = isCooldownError ? "Rate limited by gateway" : errorMessage;
        await updateMessageStatus(api, chatId, processingMessage.id, "failed", undefined, undefined, failureReason);
      }

      // Still clear typing indicator even on failure/abort
      const clutchUrl = getClutchUrl(api);
      try {
        await fetch(`${clutchUrl}/api/chats/${chatId}/typing`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ typing: false, author: "ada" }),
        });
      } catch (error) {
        api.logger.warn(`Clutch: failed to clear typing after abort for chat ${chatId}: ${error}`);
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
      api.logger.info(`Clutch: no assistant content to save for chat ${chatId}`);
      
      // Mark as responded even with no content  
      if (processingMessage) {
        await updateMessageStatus(api, chatId, processingMessage.id, "responded");
      }

      // Still clear typing indicator
      const clutchUrl2 = getClutchUrl(api);
      try {
        await fetch(`${clutchUrl2}/api/chats/${chatId}/typing`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ typing: false, author: "ada" }),
        });
      } catch {
        /* ignore */
      }
      return;
    }

    // POST the response to Clutch API → Convex
    api.logger.info(
      `Clutch: saving assistant response to chat ${chatId} (${lastAssistantContent.length} chars)`
    );
    const result = await sendToClutch(api, chatId, lastAssistantContent.trim(), {
      sessionKey,
      isAutomated: false,
    });

    if (result.ok) {
      api.logger.info(`Clutch: response saved to chat ${chatId}`);
      
      // Mark original message as responded
      if (processingMessage) {
        await updateMessageStatus(api, chatId, processingMessage.id, "responded");
      }
    } else {
      api.logger.warn(`Clutch: failed to save response to chat ${chatId}: ${result.error}`);
      
      // Mark original message as failed
      if (processingMessage) {
        await updateMessageStatus(api, chatId, processingMessage.id, "failed");
      }
    }

    // Clear typing indicator after response is saved
    const clutchUrl = getClutchUrl(api);
    try {
      await fetch(`${clutchUrl}/api/chats/${chatId}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typing: false, author: "ada" }),
      });
    } catch (error) {
      api.logger.warn(`Clutch: failed to clear typing indicator for chat ${chatId}: ${error}`);
    }
  });

  // =========================================================================
  // Channel registration (for outbound messaging via message tool)
  // =========================================================================
  api.registerChannel({
    plugin: {
      id: "clutch",
      meta: {
        id: "clutch",
        label: "OpenClutch",
        selectionLabel: "OpenClutch",
        detailLabel: "OpenClutch Orchestration",
        docsPath: "/channels/clutch",
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

          const clutchUrl = getClutchUrl(api);
          try {
            const response = await fetch(`${clutchUrl}/api/chats/${to}/typing`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ typing: isTyping, author: "ada" }),
            });
            if (!response.ok) {
              api.logger.warn(`Clutch: typing indicator failed - ${response.status}`);
              return { ok: false, error: `HTTP ${response.status}` };
            }
            return { ok: true };
          } catch (error) {
            api.logger.warn(`Clutch: typing indicator error - ${error}`);
            return {
              ok: false,
              error: error instanceof Error ? error.message : "Unknown error",
            };
          }
        },

        sendText: async (ctx) => {
          const { to, text } = ctx;
          if (!to) return { ok: false, error: "No chat ID (to) provided" };

          api.logger.info(`Clutch: sendText to chat ${to}`);
          const result = await sendToClutch(api, to, text);
          if (!result.ok) api.logger.warn(`Clutch: sendText failed - ${result.error}`);
          return {
            ok: result.ok,
            messageId: result.messageId,
            error: result.error ? new Error(result.error) : undefined,
          };
        },

        sendMedia: async (ctx) => {
          const { to, text, mediaUrl } = ctx;
          if (!to) return { ok: false, error: "No chat ID (to) provided" };

          api.logger.info(`Clutch: sendMedia to chat ${to}`);
          const result = await sendToClutch(api, to, text || "📎 Attachment", { mediaUrl });
          if (!result.ok) api.logger.warn(`Clutch: sendMedia failed - ${result.error}`);
          return {
            ok: result.ok,
            messageId: result.messageId,
            error: result.error ? new Error(result.error) : undefined,
          };
        },
      },
    },
  });

  api.logger.info("Clutch channel plugin loaded with FIFO delivery status tracking");
}