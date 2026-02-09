/**
 * Model name mapping utilities
 * Maps full model IDs to friendly short names
 */

// Mapping of full model IDs to short display names
const MODEL_NAME_MAP: Record<string, string> = {
  // Anthropic models
  'anthropic/claude-sonnet-4-20250514': 'Sonnet',
  'anthropic/claude-haiku-4-5': 'Haiku',
  'anthropic/claude-opus-4-5': 'Opus',
  'anthropic/claude-opus-4-6': 'Opus',

  // Moonshot models
  'moonshot/kimi-for-coding': 'Kimi',
  'moonshot/kimi-k2-0905-preview': 'Kimi K2',
  'moonshot/kimi-k2-thinking': 'Kimi K2 Thinking',
  'moonshot/kimi-k2.5': 'Kimi K2.5',
  'moonshot/kimi-k2.5-thinking': 'Kimi K2.5 Thinking',

  // OpenRouter models
  'openrouter/pony-alpha': 'Pony',

  // OpenAI models (for future use)
  'openai/gpt-4o': 'GPT-4o',
  'openai/gpt-4o-mini': 'GPT-4o Mini',
  'openai-codex/gpt-5.2': 'GPT-5.2',
  'openai-codex/gpt-5.3-codex': 'GPT-5.3',

  // Google models
  'google/gemini-2.5-pro': 'Gemini 2.5 Pro',
  'google/gemini-2.0-flash': 'Gemini 2.0 Flash',

  // Z.AI models
  'zai/glm-4.7': 'GLM-4.7',
}

/**
 * Get a short friendly name for a model ID
 * Falls back to the last part of the model ID if not in the map
 */
export function getModelShortName(modelId: string | null | undefined): string {
  if (!modelId) {
    return 'Unknown'
  }

  // Check exact match first
  if (MODEL_NAME_MAP[modelId]) {
    return MODEL_NAME_MAP[modelId]
  }

  // Try to extract provider and model name
  const parts = modelId.split('/')
  if (parts.length >= 2) {
    const modelName = parts[parts.length - 1]
    // Clean up common suffixes and format
    return formatModelName(modelName)
  }

  // Fallback: format the ID itself
  return formatModelName(modelId)
}

/**
 * Format a raw model name into a readable format
 */
function formatModelName(name: string): string {
  // Remove common version/date suffixes for cleaner display
  const cleaned = name
    .replace(/-\d{8}$/, '') // Remove date suffixes like -20250514
    .replace(/-\d{4}-\d{2}-\d{2}$/, '') // Remove ISO date suffixes
    .replace(/-preview$/, '') // Remove -preview suffix

  // Convert kebab-case or snake_case to Title Case
  return cleaned
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Get all known model IDs (for dropdowns, filters, etc.)
 */
export function getKnownModelIds(): string[] {
  return Object.keys(MODEL_NAME_MAP)
}

/**
 * Get provider from model ID
 */
export function getModelProvider(modelId: string | null | undefined): string {
  if (!modelId) {
    return 'unknown'
  }

  const parts = modelId.split('/')
  if (parts.length >= 2) {
    return parts[0]
  }

  return 'unknown'
}

/**
 * Check if a model is known in our mapping
 */
export function isKnownModel(modelId: string | null | undefined): boolean {
  if (!modelId) {
    return false
  }
  return modelId in MODEL_NAME_MAP
}
