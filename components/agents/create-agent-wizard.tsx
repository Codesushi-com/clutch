'use client';

/**
 * Create Agent Wizard
 * Multi-step wizard for creating new OpenClaw agents
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, ChevronLeft, ChevronRight, Check, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useOpenClawHttpRpc } from '@/lib/hooks/use-openclaw-http';

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'basic',
    title: 'Agent Details',
    description: 'Name and describe your new agent',
    icon: Bot,
  },
  {
    id: 'soul',
    title: 'Soul Template',
    description: 'Define your agent&apos;s personality and behavior',
    icon: Sparkles,
  },
  {
    id: 'confirm',
    title: 'Confirm & Create',
    description: 'Review and create your agent',
    icon: Check,
  },
];

const SOUL_TEMPLATES = [
  {
    id: 'helpful',
    name: 'Helpful Assistant',
    description: 'A friendly, helpful general-purpose assistant',
    content: `# SOUL.md - Who You Are

You are a helpful, knowledgeable assistant. You aim to be:
- Clear and concise in your responses
- Friendly but professional
- Accurate and truthful
- Respectful of user preferences

## Boundaries
- Be helpful while staying within ethical guidelines
- Ask for clarification when requests are ambiguous
- Acknowledge when you don't know something

## Style
- Use a warm, conversational tone
- Provide practical, actionable advice
- Break down complex topics into digestible parts`,
  },
  {
    id: 'coder',
    name: 'Coding Assistant',
    description: 'Specialized in programming and software development',
    content: `# SOUL.md - Who You Are

You are a coding assistant specialized in software development. You excel at:
- Writing clean, maintainable code
- Debugging and troubleshooting
- Code review and optimization
- Explaining technical concepts

## Coding Standards
- Follow best practices for the language/framework
- Write clear, self-documenting code
- Include error handling where appropriate
- Consider performance and security implications

## Style
- Be precise and technical when discussing code
- Provide working examples
- Explain your reasoning behind choices
- Suggest improvements and alternatives`,
  },
  {
    id: 'reviewer',
    name: 'Code Reviewer',
    description: 'Focused on reviewing and improving code quality',
    content: `# SOUL.md - Who You Are

You are a meticulous code reviewer focused on quality and best practices. You look for:
- Code correctness and potential bugs
- Adherence to coding standards
- Security vulnerabilities
- Performance optimization opportunities

## Review Approach
- Be constructive and specific in feedback
- Explain the "why" behind suggestions
- Acknowledge good practices
- Prioritize critical issues over style preferences

## Standards
- Security first
- Readability and maintainability
- Test coverage and quality
- Documentation completeness`,
  },
  {
    id: 'custom',
    name: 'Custom Soul',
    description: 'Write your own custom soul from scratch',
    content: `# SOUL.md - Who You Are

*Define who your agent is and how they should behave*

## Core Traits
- [Your agent's key characteristics]
- [Their primary purpose and goals]
- [How they interact with users]

## Boundaries
- [What your agent should/shouldn't do]
- [Ethical guidelines and limitations]

## Style
- [Communication style and tone]
- [How they approach problems]
- [Their personality traits]`,
  },
];

interface CreateAgentFormData {
  name: string;
  description: string;
  model: string;
  soul: string;
  selectedTemplate: string;
}

interface CreateAgentWizardProps {
  onClose: () => void;
  onSuccess?: (agentId: string) => void;
}

export default function CreateAgentWizard({ onClose, onSuccess }: CreateAgentWizardProps) {
  const router = useRouter();
  const { createAgent, connected } = useOpenClawHttpRpc();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<CreateAgentFormData>({
    name: '',
    description: '',
    model: 'anthropic/claude-sonnet-4-20250514',
    soul: '',
    selectedTemplate: 'helpful',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Update soul content when template changes
  const handleTemplateChange = (templateId: string) => {
    const template = SOUL_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setFormData(prev => ({
        ...prev,
        selectedTemplate: templateId,
        soul: template.content,
      }));
    }
  };

  // Validate current step
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 0) {
      if (!formData.name.trim()) {
        newErrors.name = 'Agent name is required';
      } else if (formData.name.length < 2) {
        newErrors.name = 'Agent name must be at least 2 characters';
      }
      
      if (!formData.description.trim()) {
        newErrors.description = 'Description is required';
      }
    } else if (step === 1) {
      if (!formData.soul.trim()) {
        newErrors.soul = 'Soul content is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, WIZARD_STEPS.length - 1));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
    setErrors({});
  };

  const handleCreate = async () => {
    if (!validateStep(currentStep)) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const result = await createAgent({
        name: formData.name.trim(),
        description: formData.description.trim(),
        model: formData.model,
        soul: formData.soul,
      });

      // Success! Redirect to the new agent detail page
      onSuccess?.(result.agent.id);
      router.push(`/agents/${result.agent.id}`);
    } catch (err) {
      console.error('Failed to create agent:', err);
      setCreateError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setIsCreating(false);
    }
  };

  const isLastStep = currentStep === WIZARD_STEPS.length - 1;
  const canProceed = currentStep < WIZARD_STEPS.length - 1;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-hidden">
        <CardHeader className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <CardTitle>Create New Agent</CardTitle>
                <CardDescription>
                  {WIZARD_STEPS[currentStep].description}
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-4 mt-4">
            {WIZARD_STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;
              
              return (
                <div key={step.id} className="flex items-center gap-2">
                  <div
                    className={`
                      p-2 rounded-lg flex items-center justify-center transition-colors
                      ${isActive ? 'bg-primary text-primary-foreground' : ''}
                      ${isCompleted ? 'bg-green-100 text-green-700' : ''}
                      ${!isActive && !isCompleted ? 'bg-muted text-muted-foreground' : ''}
                    `}
                  >
                    {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className={`text-sm font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                    {step.title}
                  </span>
                  {index < WIZARD_STEPS.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground mx-2" />
                  )}
                </div>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="overflow-y-auto max-h-[60vh]">
          {/* Connection Warning */}
          {!connected && (
            <Alert className="mb-6" variant="destructive">
              <AlertDescription>
                Not connected to OpenClaw. Please ensure OpenClaw is running and try again.
              </AlertDescription>
            </Alert>
          )}

          {/* Create Error */}
          {createError && (
            <Alert className="mb-6" variant="destructive">
              <AlertDescription>
                {createError}
              </AlertDescription>
            </Alert>
          )}

          {/* Step 1: Basic Details */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="agent-name">Agent Name *</Label>
                <Input
                  id="agent-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Ada, Kimi, Assistant"
                  className={errors.name ? 'border-red-500' : ''}
                />
                {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-description">Description *</Label>
                <Textarea
                  id="agent-description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this agent does and its purpose..."
                  className={`min-h-[100px] ${errors.description ? 'border-red-500' : ''}`}
                />
                {errors.description && <p className="text-sm text-red-500">{errors.description}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-model">Model</Label>
                <select
                  id="agent-model"
                  value={formData.model}
                  onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="anthropic/claude-opus-4-5">Claude Opus (Most Capable)</option>
                  <option value="anthropic/claude-sonnet-4-20250514">Claude Sonnet (Balanced)</option>
                  <option value="anthropic/claude-haiku-4-5">Claude Haiku (Fast)</option>
                  <option value="moonshot/kimi-for-coding">Kimi for Coding</option>
                  <option value="zai/glm-4.7">GLM-4.7</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 2: Soul Template */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-4">
                <Label>Choose a Soul Template</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {SOUL_TEMPLATES.map((template) => (
                    <div
                      key={template.id}
                      onClick={() => handleTemplateChange(template.id)}
                      className={`
                        p-4 rounded-lg border cursor-pointer transition-colors
                        ${formData.selectedTemplate === template.id 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border hover:border-primary/50'}
                      `}
                    >
                      <h4 className="font-semibold mb-2">{template.name}</h4>
                      <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
                      {formData.selectedTemplate === template.id && (
                        <Badge variant="default" className="text-xs">Selected</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="soul-content">Soul Content *</Label>
                <Textarea
                  id="soul-content"
                  value={formData.soul}
                  onChange={(e) => setFormData(prev => ({ ...prev, soul: e.target.value }))}
                  placeholder="Define your agent's personality and behavior..."
                  className={`min-h-[300px] font-mono text-sm ${errors.soul ? 'border-red-500' : ''}`}
                />
                {errors.soul && <p className="text-sm text-red-500">{errors.soul}</p>}
                <p className="text-xs text-muted-foreground">
                  This will be saved as the agent&apos;s SOUL.md file. You can edit it later.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Confirmation */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-semibold">Agent Details</h4>
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm font-medium">Name:</span>
                      <p className="text-sm">{formData.name}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium">Description:</span>
                      <p className="text-sm">{formData.description}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium">Model:</span>
                      <p className="text-sm">{formData.model}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold">Soul Preview</h4>
                  <div className="p-3 bg-muted rounded-lg max-h-[200px] overflow-y-auto">
                    <pre className="text-xs whitespace-pre-wrap">
                      {formData.soul.length > 300 
                        ? `${formData.soul.substring(0, 300)}...` 
                        : formData.soul}
                    </pre>
                  </div>
                </div>
              </div>

              <Alert>
                <AlertDescription>
                  Your agent will be created with the specified configuration. 
                  You can modify the soul file and other settings after creation.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>

        {/* Footer */}
        <div className="p-6 border-t flex items-center justify-between">
          <Button
            variant="outline"
            onClick={currentStep === 0 ? onClose : handleBack}
            disabled={isCreating}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            {currentStep === 0 ? 'Cancel' : 'Back'}
          </Button>

          {isLastStep ? (
            <Button 
              onClick={handleCreate}
              disabled={!connected || isCreating}
            >
              {isCreating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Create Agent
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleNext}>
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}