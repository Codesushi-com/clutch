import { NextResponse } from "next/server";
import { getOpenClawClient } from "@/lib/openclaw/client";

// Re-export config for edge runtime (uses Node.js WebSocket, not edge-compatible)
export const runtime = "nodejs";

// ============================================================================
// Types
// ============================================================================

interface ModelInfo {
  id: string;
  alias?: string;
  provider: string;
  name: string;
  description?: string;
}

interface ModelsResponse {
  models: ModelInfo[];
  status: "connected" | "disconnected" | "fallback";
  cachedAt?: string;
}

interface GatewayModelConfig {
  alias?: string;
  params?: Record<string, unknown>;
  streaming?: boolean;
}

interface GatewayConfig {
  agents?: {
    defaults?: {
      models?: Record<string, GatewayModelConfig>;
    };
  };
}

// ============================================================================
// Static alias map (fallback when gateway is unavailable)
// Synced with lib/slash-commands.ts modelMap
// ============================================================================

const STATIC_MODEL_ALIASES: Record<string, { alias: string; provider: string; name: string }> = {
  // Moonshot / Kimi
  "moonshot/kimi-for-coding": { alias: "kimi", provider: "moonshot", name: "Kimi (Coding)" },
  "moonshot/kimi-k2-0905-preview": { alias: "kimi-k2", provider: "moonshot", name: "Kimi K2" },
  "moonshot/kimi-k2-thinking": { alias: "kimi-k2-thinking", provider: "moonshot", name: "Kimi K2 Thinking" },

  // Anthropic / Claude
  "anthropic/claude-sonnet-4-20250514": { alias: "sonnet", provider: "anthropic", name: "Claude Sonnet 4" },
  "anthropic/claude-opus-4-6": { alias: "opus", provider: "anthropic", name: "Claude Opus 4.6" },
  "anthropic/claude-haiku-4-5": { alias: "haiku", provider: "anthropic", name: "Claude Haiku" },

  // Z.AI / GLM
  "zai/glm-4.7": { alias: "glm", provider: "zai", name: "GLM 4.7" },
};

// ============================================================================
// Cache
// ============================================================================

let cachedModels: ModelsResponse | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isCacheValid(): boolean {
  if (!cachedModels || !cacheTimestamp) return false;
  return Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

function setCachedModels(models: ModelsResponse): void {
  cachedModels = {
    ...models,
    cachedAt: new Date().toISOString(),
  };
  cacheTimestamp = Date.now();
}

// ============================================================================
// Model parsing helpers
// ============================================================================

function parseModelId(modelId: string): { provider: string; name: string } {
  const parts = modelId.split("/");
  if (parts.length >= 2) {
    return {
      provider: parts[0],
      name: parts.slice(1).join("/"),
    };
  }
  return { provider: "unknown", name: modelId };
}

function formatModelName(name: string): string {
  // Convert model id to friendly name
  // e.g., "claude-sonnet-4-20250514" -> "Claude Sonnet 4"
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildModelsFromGatewayConfig(config: GatewayConfig): ModelInfo[] {
  const models: ModelInfo[] = [];
  const modelEntries = config.agents?.defaults?.models;

  if (!modelEntries) {
    return models;
  }

  for (const [modelId, modelConfig] of Object.entries(modelEntries)) {
    const { provider, name } = parseModelId(modelId);
    const alias = modelConfig.alias;

    models.push({
      id: modelId,
      alias,
      provider,
      name: alias
        ? formatModelName(alias)
        : formatModelName(name),
    });
  }

  return models;
}

function buildModelsFromStaticFallback(): ModelInfo[] {
  const models: ModelInfo[] = [];

  for (const [modelId, info] of Object.entries(STATIC_MODEL_ALIASES)) {
    models.push({
      id: modelId,
      alias: info.alias,
      provider: info.provider,
      name: info.name,
    });
  }

  return models;
}

// ============================================================================
// API Handler
// ============================================================================

/**
 * GET /api/openclaw/models
 *
 * Returns available models from the OpenClaw gateway.
 * Includes friendly names/aliases where available.
 *
 * Response format:
 * {
 *   models: [
 *     { id: "anthropic/claude-sonnet-4", alias: "sonnet", provider: "anthropic", name: "Claude Sonnet 4" },
 *     ...
 *   ],
 *   status: "connected" | "disconnected" | "fallback",
 *   cachedAt?: "2024-01-15T10:30:00.000Z"
 * }
 */
export async function GET(): Promise<NextResponse> {
  try {
    // Return cached response if valid
    if (isCacheValid() && cachedModels) {
      return NextResponse.json(cachedModels);
    }

    const client = getOpenClawClient();
    const isConnected = client.getStatus() === "connected";

    // If not connected, return fallback
    if (!isConnected) {
      const fallbackResponse: ModelsResponse = {
        models: buildModelsFromStaticFallback(),
        status: "disconnected",
      };

      // Cache the fallback response (shorter TTL)
      setCachedModels(fallbackResponse);
      cacheTimestamp = Date.now() - CACHE_TTL_MS + 30000; // 30s TTL for fallback

      return NextResponse.json(fallbackResponse);
    }

    // Query gateway for config
    try {
      const config = await client.rpc<GatewayConfig>("config.get", {});
      const models = buildModelsFromGatewayConfig(config);

      // If gateway returned no models, use fallback
      if (models.length === 0) {
        const fallbackResponse: ModelsResponse = {
          models: buildModelsFromStaticFallback(),
          status: "fallback",
        };
        setCachedModels(fallbackResponse);
        return NextResponse.json(fallbackResponse);
      }

      // Success - cache and return
      const response: ModelsResponse = {
        models,
        status: "connected",
      };
      setCachedModels(response);
      return NextResponse.json(response);
    } catch (rpcError) {
      // RPC failed - return fallback with fallback status
      const errorMessage = rpcError instanceof Error ? rpcError.message : "Unknown error";
      console.warn("[Models API] Failed to fetch from gateway:", errorMessage);

      const fallbackResponse: ModelsResponse = {
        models: buildModelsFromStaticFallback(),
        status: "fallback",
      };

      // Don't cache errors for long
      setCachedModels(fallbackResponse);
      cacheTimestamp = Date.now() - CACHE_TTL_MS + 30000; // 30s TTL for error fallback

      return NextResponse.json(fallbackResponse);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch models";
    console.error("[Models API] Unexpected error:", message);

    return NextResponse.json(
      {
        models: buildModelsFromStaticFallback(),
        status: "disconnected",
        error: message,
      },
      { status: 200 } // Return 200 with fallback data
    );
  }
}
