'use client';

/**
 * Markdown Editor Component
 * Simple markdown editor with preview functionality
 */

import React, { useState, useEffect } from 'react';
import { Eye, Edit, Save, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface MarkdownEditorProps {
  initialContent?: string;
  onSave: (content: string) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
  saveButtonText?: string;
  className?: string;
  readOnly?: boolean;
}

export function MarkdownEditor({
  initialContent = '',
  onSave,
  onCancel,
  placeholder = 'Enter markdown content...',
  saveButtonText = 'Save',
  className = '',
  readOnly = false,
}: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isPreview, setIsPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setContent(initialContent);
    setIsDirty(false);
  }, [initialContent]);

  useEffect(() => {
    setIsDirty(content !== initialContent);
  }, [content, initialContent]);

  const handleSave = async () => {
    if (!isDirty) return;
    
    try {
      setIsSaving(true);
      await onSave(content);
      setIsDirty(false);
    } catch (error) {
      console.error('Failed to save:', error);
      // Let parent handle error display
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setContent(initialContent);
    setIsDirty(false);
    if (onCancel) {
      onCancel();
    }
  };

  // Simple markdown to HTML renderer for preview
  const renderMarkdown = (text: string) => {
    const html = text
      // Headers
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-4 mb-3">$1</h1>')
      // Bold and italic
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Code blocks
      .replace(/```([\s\S]*?)```/g, '<pre class="bg-muted p-3 rounded-lg overflow-auto my-3"><code>$1</code></pre>')
      .replace(/`(.*?)`/g, '<code class="bg-muted px-1 rounded">$1</code>')
      // Lists
      .replace(/^\- (.*$)/gim, '<li class="ml-4">• $1</li>')
      .replace(/^\* (.*$)/gim, '<li class="ml-4">• $1</li>')
      // Line breaks
      .replace(/\n/g, '<br />');

    return html;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!readOnly && (
            <>
              <Button
                variant={isPreview ? "outline" : "default"}
                size="sm"
                onClick={() => setIsPreview(false)}
                disabled={isSaving}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button
                variant={isPreview ? "default" : "outline"}
                size="sm"
                onClick={() => setIsPreview(true)}
                disabled={isSaving}
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
            </>
          )}
          {isDirty && !readOnly && (
            <Badge variant="secondary" className="text-xs">
              Unsaved changes
            </Badge>
          )}
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            {isDirty && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={isSaving}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={!isDirty || isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {saveButtonText}
            </Button>
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="border rounded-lg">
        {isPreview || readOnly ? (
          /* Preview mode */
          <div className="p-4 min-h-[400px]">
            {content ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(content)
                }}
              />
            ) : (
              <div className="text-muted-foreground italic">
                No content to preview
              </div>
            )}
          </div>
        ) : (
          /* Edit mode */
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            className="w-full min-h-[400px] p-4 bg-transparent border-none resize-none focus:outline-none focus:ring-0"
            disabled={readOnly || isSaving}
          />
        )}
      </div>

      {/* Footer info */}
      <div className="text-xs text-muted-foreground">
        {content.length} characters
        {content.split('\n').length > 1 && `, ${content.split('\n').length} lines`}
      </div>
    </div>
  );
}

export default MarkdownEditor;