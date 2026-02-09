'use client';

/**
 * File Tree Component
 * Display a tree of files with selection capability
 */

import React from 'react';
import { FileText, Folder, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface FileTreeItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface FileTreeProps {
  files: FileTreeItem[];
  selectedFile?: string;
  onFileSelect: (filePath: string) => void;
  onCreateFile?: (fileName: string) => void;
  className?: string;
  loading?: boolean;
}

export function FileTree({
  files,
  selectedFile,
  onFileSelect,
  onCreateFile,
  className = '',
  loading = false,
}: FileTreeProps) {
  const [newFileName, setNewFileName] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);

  const handleCreateFile = () => {
    if (newFileName.trim() && onCreateFile) {
      const fileName = newFileName.trim();
      // Ensure .md extension
      const finalName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
      // For memory files, prefix with memory/ if it's not MEMORY.md
      const filePath = finalName === 'MEMORY.md' ? finalName : `memory/${finalName}`;
      onCreateFile(filePath);
      setNewFileName('');
      setIsCreating(false);
    }
  };

  const handleCancelCreate = () => {
    setNewFileName('');
    setIsCreating(false);
  };

  if (loading) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-muted rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {/* File list */}
      <div className="space-y-1">
        {files.map((file) => (
          <button
            key={file.path}
            onClick={() => onFileSelect(file.path)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm rounded-md transition-colors ${
              selectedFile === file.path
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            {file.isDirectory ? (
              <Folder className="h-4 w-4 text-muted-foreground" />
            ) : (
              <FileText className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="truncate">{file.name}</span>
          </button>
        ))}
      </div>

      {/* Create new file section */}
      {onCreateFile && (
        <div className="border-t pt-2 mt-2">
          {isCreating ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="filename.md"
                  className="flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateFile();
                    } else if (e.key === 'Escape') {
                      handleCancelCreate();
                    }
                  }}
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleCreateFile}
                  disabled={!newFileName.trim()}
                  className="h-6 text-xs"
                >
                  Create
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelCreate}
                  className="h-6 text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsCreating(true)}
              className="w-full justify-start h-7 text-xs text-muted-foreground"
            >
              <Plus className="h-3 w-3 mr-1" />
              New memory file
            </Button>
          )}
        </div>
      )}

      {/* Empty state */}
      {files.length === 0 && !isCreating && (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No memory files found</p>
          {onCreateFile && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsCreating(true)}
              className="mt-2 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Create first memory file
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default FileTree;