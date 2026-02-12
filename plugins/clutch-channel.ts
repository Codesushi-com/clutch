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
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

// Configuration for image processing
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "images");
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

// Supported image MIME types
const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
];

// File extensions for MIME types
const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

/**
 * Ensure the upload directory exists
 */
async function ensureUploadDir(): Promise<void> {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * Generate a unique filename for an image
 */
function generateImageFilename(mimeType: string): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString("hex");
  const ext = MIME_TO_EXT[mimeType] || ".png";
  return `${timestamp}-${random}${ext}`;
}

/**
 * Detect MIME type from file extension
 */
function detectMimeTypeFromExt(ext: string): string | null {
  const extLower = ext.toLowerCase();
  switch (extLower) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return null;
  }
}

/**
 * Load image from an absolute path and return a markdown image tag
 */
async function loadImageFromAbsolutePath(
  fullPath: string,
  originalPath: string,
): Promise<string | null> {
  try {
    // Read file
    const buffer = await fs.readFile(fullPath);

    // Check size
    if (buffer.length > MAX_IMAGE_SIZE) {
      console.warn(`[ImageProcessor] Image too large: ${buffer.length} bytes`);
      return null;
    }

    // Detect MIME type from file extension
    const ext = path.extname(originalPath).toLowerCase();
    const mimeType = detectMimeTypeFromExt(ext);

    if (!mimeType || !ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      console.warn(`[ImageProcessor] Unsupported image type: ${ext}`);
      return null;
    }

    // Ensure upload directory exists
    await ensureUploadDir();

    // Generate filename and save
    const filename = generateImageFilename(mimeType);
    const filePath = path.join(UPLOAD_DIR, filename);
    await fs.writeFile(filePath, buffer);

    // Clean up the original file in /tmp (best effort)
    try {
      await fs.unlink(fullPath);
      console.log(`[ImageProcessor] Cleaned up temp file: ${fullPath}`);
    } catch {
      // Ignore cleanup errors - OS will handle stale files
    }

    // Return public URL
    return `/uploads/images/${filename}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[ImageProcessor] Failed to load image from ${originalPath}: ${message}`,
    );
    return null;
  }
}

/**
 * Parse IMAGE: tags from text content
 * Returns extracted image paths and cleaned text
 * IMAGE: tags allow absolute paths (must be within /tmp/openclaw-images/)
 */
export function parseImageTags(text: string): {
  cleanedText: string;
  imagePaths: string[];
} {
  const imagePaths: string[] = [];
  const lines = text.split("\n");
  const keptLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Match lines that start with IMAGE: (possibly with leading whitespace)
    if (trimmed.startsWith("IMAGE:")) {
      const imagePath = trimmed.slice(6).trim(); // Remove "IMAGE:" prefix
      // Validate path - must be absolute and within /tmp/openclaw-images/
      if (
        imagePath &&
        imagePath.startsWith("/tmp/openclaw-images/") &&
        !imagePath.includes("..")
      ) {
        imagePaths.push(imagePath);
      } else if (!imagePath) {
        // Empty IMAGE: tag - strip it
        continue;
      } else {
        // Invalid path, keep the line as-is
        keptLines.push(line);
      }
    } else {
      keptLines.push(line);
    }
  }

  return {
    cleanedText: keptLines.join("\n").trim(),
    imagePaths,
  };
}

/**
 * Process message content and extract IMAGE: tags
 * Returns the processed content with image markdown tags
 */
async function processImageTags(content: string): Promise<string> {
  const { cleanedText, imagePaths } = parseImageTags(content);

  // Process any IMAGE: tags
  const imageParts: string[] = [];
  for (const imagePath of imagePaths) {
    const imageUrl = await loadImageFromAbsolutePath(imagePath, imagePath);
    if (imageUrl) {
      imageParts.push(`![image](${imageUrl})`);
    }
  }

  // Combine cleaned text with any processed images
  const parts: string[] = [];
  if (cleanedText) {
    parts.push(cleanedText);
  }
  if (imageParts.length > 0) {
    parts.push(...imageParts);
  }

  return parts.join("\n\n");
}

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
 * Get ALL human messages with "sent" status (for batch delivery marking)
 */
async function getAllSentMessages(
  api: OpenClawPluginApi,
  chatId: string
): Promise<{ id: string; delivery_status?: string }[]> {
  const clutchUrl = getClutchUrl(api);

  try {
    const response = await fetch(`${clutchUrl}/api/chats/${chatId}/all-sent-messages`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      api.logger.warn(`Clutch: failed to get all sent messages for chat ${chatId}: HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    api.logger.warn(`Clutch: error getting all sent messages for chat ${chatId}: ${error}`);
    return [];
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
    // Process IMAGE: tags in the content
    const processedContent = await processImageTags(content);

    const body: Record<string, unknown> = {
      author: "ada",
      content: mediaUrl ? `${processedContent}\n\n📎 ${mediaUrl}` : processedContent,
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
  // message_received hook — update ALL "sent" messages to "delivered"
  // =========================================================================
  api.on("message_received", async (event, ctx) => {
    // message_received context has channelId + conversationId, not sessionKey
    // For clutch messages, channelId is "clutch" and conversationId is the chatId
    if (ctx.channelId !== "clutch") return;
    const chatId = ctx.conversationId;
    if (!chatId) return;

    // Mark ALL sent messages as delivered since the gateway has received them all
    // This fixes the issue where queued messages stayed stuck at "sent" status
    const sentMessages = await getAllSentMessages(api, chatId);

    if (sentMessages.length > 0) {
      api.logger.info(`Clutch: marking ${sentMessages.length} sent message(s) as delivered for chat ${chatId}`);

      for (const message of sentMessages) {
        if (message.delivery_status === "sent") {
          const result = await updateMessageStatus(api, chatId, message.id, "delivered");

          if (!result.ok) {
            api.logger.warn(`Clutch: failed to mark message ${message.id} as delivered: ${result.error}`);
          }
        }
      }
    }
  });

  // =========================================================================
  // before_agent_start hook — update oldest "delivered" message to "processing" (FIFO)
  // =========================================================================
  api.on("before_agent_start", async (event, ctx) => {
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