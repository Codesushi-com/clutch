'use client';

/**
 * Agent Configuration Modal
 * Modal for configuring agent settings like model, temperature, max tokens, etc.
 */

import { useState, useEffect } from 'react';
import { X, Settings, Zap, Thermometer, Hash, FileText, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AgentDetail } from '@/lib/types';

interface AgentConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: AgentDetail | null;
  onSave: (config: AgentConfiguration) => Promise<void>;
}

interface AgentConfiguration {
  model: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  enabled: boolean;
}

// Common model options
const MODEL_OPTIONS = [
  { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Default)' },
  { value: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4' },
  { value: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4' },
  { value: 'openai/gpt-4o', label: 'GPT-4o' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'moonshot/kimi-for-coding', label: 'Kimi for Coding' },
  { value: 'moonshot/kimi-k2.5', label: 'Kimi K2.5' },
  { value: 'zai/glm-4.7', label: 'GLM 4.7' },
  { value: 'other', label: 'Other (enter manually)' },
];

export function AgentConfigModal({ isOpen, onClose, agent, onSave }: AgentConfigModalProps) {
  const [config, setConfig] = useState<AgentConfiguration>({
    model: agent?.model || 'anthropic/claude-sonnet-4-20250514',
    maxTokens: agent?.configuration?.maxTokens,
    temperature: agent?.configuration?.temperature,
    systemPrompt: agent?.configuration?.systemPrompt,
    enabled: true, // Assume enabled by default
  });
  const [customModel, setCustomModel] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update config when agent changes
  useEffect(() => {
    if (agent) {
      const isCustomModel = !MODEL_OPTIONS.some(opt => opt.value === agent.model);
      setConfig({
        model: isCustomModel ? 'other' : agent.model,
        maxTokens: agent.configuration?.maxTokens,
        temperature: agent.configuration?.temperature,
        systemPrompt: agent.configuration?.systemPrompt,
        enabled: true, // We don't have this info yet, assume enabled
      });
      if (isCustomModel) {
        setCustomModel(agent.model);
      }
    }
  }, [agent]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);

      // Validate inputs
      const finalModel = config.model === 'other' ? customModel : config.model;
      if (!finalModel.trim()) {
        throw new Error('Model is required');
      }

      if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
        throw new Error('Temperature must be between 0 and 2');
      }

      if (config.maxTokens !== undefined && config.maxTokens <= 0) {
        throw new Error('Max tokens must be a positive number');
      }

      const finalConfig: AgentConfiguration = {
        ...config,
        model: finalModel,
      };

      await onSave(finalConfig);
      onClose();
    } catch (err) {
      console.error('Failed to save agent configuration:', err);
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Configure Agent</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {error && (
            <Alert className="mb-6" variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-6">
            {/* Agent Info */}
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-medium mb-2">{agent?.name}</h3>
              <p className="text-sm text-muted-foreground">
                {agent?.description || 'AI Agent'}
              </p>
              <div className="text-xs text-muted-foreground mt-1">
                ID: {agent?.id}
              </div>
            </div>

            {/* Model Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Model
              </Label>
              <Select
                value={config.model}
                onValueChange={(value) => setConfig(prev => ({ ...prev, model: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {config.model === 'other' && (
                <Input
                  placeholder="e.g., anthropic/claude-3-haiku"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  className="mt-2"
                />
              )}
              <p className="text-xs text-muted-foreground">
                The AI model to use for this agent&apos;s responses.
              </p>
            </div>

            {/* Temperature */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Thermometer className="h-4 w-4" />
                Temperature
              </Label>
              <Input
                type="number"
                placeholder="e.g., 0.7 (leave empty for default)"
                value={config.temperature ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setConfig(prev => ({ 
                    ...prev, 
                    temperature: value === '' ? undefined : Number(value)
                  }));
                }}
                step="0.1"
                min="0"
                max="2"
              />
              <p className="text-xs text-muted-foreground">
                Controls randomness. 0 = deterministic, 1 = balanced, 2 = very creative. Leave empty for model default.
              </p>
            </div>

            {/* Max Tokens */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Hash className="h-4 w-4" />
                Max Tokens
              </Label>
              <Input
                type="number"
                placeholder="e.g., 4096 (leave empty for default)"
                value={config.maxTokens ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setConfig(prev => ({ 
                    ...prev, 
                    maxTokens: value === '' ? undefined : Number(value)
                  }));
                }}
                min="1"
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of tokens in the response. Leave empty for model default.
              </p>
            </div>

            {/* System Prompt */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                System Prompt
              </Label>
              <Textarea
                placeholder="Custom system prompt (leave empty for default)"
                value={config.systemPrompt ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setConfig(prev => ({ 
                    ...prev, 
                    systemPrompt: value === '' ? undefined : value
                  }));
                }}
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Custom instructions that define how the agent should behave. Leave empty to use the agent&apos;s SOUL.md file.
              </p>
            </div>

            {/* Enable/Disable Toggle */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                {config.enabled ? (
                  <ToggleRight className="h-4 w-4 text-green-600" />
                ) : (
                  <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                )}
                Agent Status
              </Label>
              <div className="flex items-center gap-3">
                <Button
                  variant={config.enabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => setConfig(prev => ({ ...prev, enabled: true }))}
                >
                  Enabled
                </Button>
                <Button
                  variant={!config.enabled ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => setConfig(prev => ({ ...prev, enabled: false }))}
                >
                  Disabled
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {config.enabled 
                  ? "Agent can accept new sessions and respond to messages."
                  : "Agent will not accept new sessions or respond to messages."
                }
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Configuration'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}