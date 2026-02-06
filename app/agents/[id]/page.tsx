'use client';

/**
 * Agent Detail Page
 * View detailed information about a specific agent
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Bot, Loader2, AlertCircle, Activity, Zap, Clock, MessageSquare, Settings, BarChart3, X, Info, Heart, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOpenClawHttpRpc } from '@/lib/hooks/use-openclaw-http';
import { AgentDetail, AgentStatus } from '@/lib/types';
import { MarkdownEditor } from '@/components/editors/markdown-editor';
import { FileTree } from '@/components/editors/file-tree';
import { AgentConfigModal } from '@/components/agents/agent-config-modal';

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  
  const [isLoading, setIsLoading] = useState(true);
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'soul' | 'memory'>('overview');
  const [soulContent, setSoulContent] = useState<string>('');
  const [soulExists, setSoulExists] = useState(false);
  const [soulLoading, setSoulLoading] = useState(false);
  const [memoryFiles, setMemoryFiles] = useState<Array<{ name: string; path: string; isDirectory: boolean }>>([]);
  const [selectedMemoryFile, setSelectedMemoryFile] = useState<string>('');
  const [memoryContent, setMemoryContent] = useState<string>('');
  const [memoryExists, setMemoryExists] = useState(false);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);

  const {
    getAgent,
    updateAgentConfig,
    getAgentSoul,
    updateAgentSoul,
    getAgentMemoryFiles,
    getAgentMemoryFile,
    updateAgentMemoryFile,
    connected
  } = useOpenClawHttpRpc();

  // Simple toast function
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  // Handle save agent configuration
  const handleSaveConfig = useCallback(async (config: {
    model: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
    enabled: boolean;
  }) => {
    if (!agent) return;

    try {
      const response = await updateAgentConfig(agent.id, config);
      
      // Update local agent state with new config
      setAgent(response.agent);
      
      // Close modal and show success
      setConfigModalOpen(false);
      showToast('Agent configuration updated successfully');
    } catch (err) {
      console.error('Failed to save agent configuration:', err);
      throw err; // Re-throw so the modal can show the error
    }
  }, [agent, updateAgentConfig, showToast]);

  // Load soul content
  const loadSoulContent = useCallback(async () => {
    if (!connected || !agentId) return;
    
    try {
      setSoulLoading(true);
      const response = await getAgentSoul(agentId);
      setSoulContent(response.content || '');
      setSoulExists(response.exists);
    } catch (error) {
      console.error('Failed to load soul content:', error);
      showToast("Failed to load soul content", "error");
      setSoulContent('');
      setSoulExists(false);
    } finally {
      setSoulLoading(false);
    }
  }, [connected, agentId, getAgentSoul, showToast]);

  // Save soul content
  const saveSoulContent = async (content: string) => {
    if (!connected || !agentId) {
      throw new Error('Not connected to OpenClaw');
    }
    
    try {
      await updateAgentSoul(agentId, content);
      setSoulContent(content);
      setSoulExists(true);
      showToast("Soul content saved successfully");
    } catch (error) {
      console.error('Failed to save soul content:', error);
      showToast("Failed to save soul content", "error");
      throw error;
    }
  };

  // Load memory files list
  const loadMemoryFiles = useCallback(async () => {
    if (!connected || !agentId) return;
    
    try {
      setFilesLoading(true);
      const response = await getAgentMemoryFiles(agentId);
      setMemoryFiles(response.files);
      
      // Auto-select MEMORY.md if it exists and no file is selected
      if (!selectedMemoryFile && response.files.length > 0) {
        const memoryMd = response.files.find(f => f.name === 'MEMORY.md');
        if (memoryMd) {
          setSelectedMemoryFile(memoryMd.path);
        }
      }
    } catch (error) {
      console.error('Failed to load memory files:', error);
      showToast("Failed to load memory files", "error");
      setMemoryFiles([]);
    } finally {
      setFilesLoading(false);
    }
  }, [connected, agentId, getAgentMemoryFiles, showToast, selectedMemoryFile]);

  // Load memory file content
  const loadMemoryFileContent = useCallback(async (filePath: string) => {
    if (!connected || !agentId || !filePath) return;
    
    try {
      setMemoryLoading(true);
      const response = await getAgentMemoryFile(agentId, filePath);
      setMemoryContent(response.content || '');
      setMemoryExists(response.exists);
    } catch (error) {
      console.error('Failed to load memory file content:', error);
      showToast("Failed to load memory file content", "error");
      setMemoryContent('');
      setMemoryExists(false);
    } finally {
      setMemoryLoading(false);
    }
  }, [connected, agentId, getAgentMemoryFile, showToast]);

  // Save memory file content
  const saveMemoryContent = async (content: string) => {
    if (!connected || !agentId || !selectedMemoryFile) {
      throw new Error('Not connected to OpenClaw or no file selected');
    }
    
    try {
      await updateAgentMemoryFile(agentId, selectedMemoryFile, content);
      setMemoryContent(content);
      setMemoryExists(true);
      showToast("Memory file saved successfully");
      
      // Reload files list to update any new files
      await loadMemoryFiles();
    } catch (error) {
      console.error('Failed to save memory content:', error);
      showToast("Failed to save memory content", "error");
      throw error;
    }
  };

  // Handle memory file selection
  const handleMemoryFileSelect = (filePath: string) => {
    setSelectedMemoryFile(filePath);
    loadMemoryFileContent(filePath);
  };

  // Handle create new memory file
  const handleCreateMemoryFile = async (filePath: string) => {
    try {
      // Create empty file
      await updateAgentMemoryFile(agentId!, filePath, '');
      
      // Reload files and select the new file
      await loadMemoryFiles();
      setSelectedMemoryFile(filePath);
      setMemoryContent('');
      setMemoryExists(true);
      
      showToast("Memory file created successfully");
    } catch (error) {
      console.error('Failed to create memory file:', error);
      showToast("Failed to create memory file", "error");
    }
  };

  // Load agent data
  useEffect(() => {
    const loadAgent = async () => {
      if (!connected || !agentId) return;
      
      try {
        setIsLoading(true);
        const response = await getAgent(agentId);
        setAgent(response.agent);
      } catch (error) {
        console.error('Failed to load agent:', error);
        showToast("Failed to load agent details", "error");
      } finally {
        setIsLoading(false);
      }
    };

    loadAgent();
  }, [agentId, connected, getAgent, showToast]);

  // Load soul content when switching to soul tab
  useEffect(() => {
    if (activeTab === 'soul' && connected && agentId && !soulLoading) {
      loadSoulContent();
    }
  }, [activeTab, connected, agentId, soulLoading, loadSoulContent]);

  // Load memory files when switching to memory tab
  useEffect(() => {
    if (activeTab === 'memory' && connected && agentId && !filesLoading) {
      loadMemoryFiles();
    }
  }, [activeTab, connected, agentId, filesLoading, loadMemoryFiles]);

  // Load memory file content when file is selected
  useEffect(() => {
    if (selectedMemoryFile && activeTab === 'memory' && connected && agentId && !memoryLoading) {
      loadMemoryFileContent(selectedMemoryFile);
    }
  }, [selectedMemoryFile, activeTab, connected, agentId, memoryLoading, loadMemoryFileContent]);

  // Status colors and variants
  const statusColors = {
    active: 'bg-green-500',
    idle: 'bg-yellow-500',
    offline: 'bg-red-500',
  };

  const statusVariants = {
    active: 'default' as const,
    idle: 'secondary' as const,
    offline: 'destructive' as const,
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return 'Unknown';
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!agent && !isLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Button variant="ghost" onClick={() => router.push('/agents')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Agents
        </Button>
        <div className="rounded-lg border p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">Agent Not Found</h1>
          <p className="text-muted-foreground">
            The agent you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <Button variant="ghost" onClick={() => router.push('/agents')} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Agents
      </Button>

      <div className="rounded-lg border bg-card p-6">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-muted">
              <Bot className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">{agent?.name}</h1>
              <p className="text-muted-foreground mt-1">{agent?.description || 'AI Agent'}</p>
              <div className="flex items-center gap-2 mt-3">
                <Badge variant={statusVariants[agent?.status as AgentStatus]}>
                  <span className={`w-2 h-2 rounded-full ${statusColors[agent?.status as AgentStatus]} mr-2`} />
                  {agent?.status}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  ID: <span className="font-mono">{agentId}</span>
                </span>
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setConfigModalOpen(true)}
              disabled={!connected}
            >
              <Settings className="h-4 w-4 mr-2" />
              Configure
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-6 border-b">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-primary text-primary bg-muted/50'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
            }`}
          >
            <Info className="h-4 w-4 mr-2 inline" />
            Overview
          </button>
          <button
            onClick={() => setActiveTab('soul')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === 'soul'
                ? 'border-primary text-primary bg-muted/50'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
            }`}
          >
            <Heart className="h-4 w-4 mr-2 inline" />
            Soul
            {soulExists && <Badge variant="secondary" className="ml-2 text-xs">SOUL.md</Badge>}
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === 'memory'
                ? 'border-primary text-primary bg-muted/50'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
            }`}
          >
            <Brain className="h-4 w-4 mr-2 inline" />
            Memory
            {memoryFiles.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{memoryFiles.length}</Badge>}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div>
            {/* Overview content - original agent details */}

        {/* Core Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="rounded-lg bg-muted p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Model</span>
            </div>
            <div className="font-medium text-lg">{agent?.model}</div>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Active Sessions</span>
            </div>
            <div className="font-medium text-lg">{agent?.sessionCount || 0}</div>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Tokens</span>
            </div>
            <div className="font-medium text-lg">
              {agent?.totalTokens ? agent.totalTokens.toLocaleString() : 'N/A'}
            </div>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Created</span>
            </div>
            <div className="font-medium text-lg">{formatDate(agent?.createdAt || '')}</div>
          </div>
        </div>

        {/* Configuration Section */}
        {agent?.configuration && (
          <div className="border-t pt-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Max Tokens</div>
                <div className="font-medium">{agent.configuration.maxTokens || 'Default'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Temperature</div>
                <div className="font-medium">{agent.configuration.temperature || 'Default'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">System Prompt</div>
                <div className="font-medium">
                  {agent.configuration.systemPrompt ? 'Custom' : 'Default'}
                </div>
              </div>
            </div>
            {agent.configuration.systemPrompt && (
              <div className="mt-4">
                <div className="text-sm text-muted-foreground mb-2">System Prompt</div>
                <div className="bg-muted p-3 rounded-lg text-sm font-mono">
                  {agent.configuration.systemPrompt}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Usage Stats */}
        {agent?.stats && (
          <div className="border-t pt-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Usage Statistics
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg bg-muted p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total Messages</span>
                </div>
                <div className="text-2xl font-bold">{agent.stats.totalMessages.toLocaleString()}</div>
              </div>
              {agent.stats.averageResponseTime && (
                <div className="rounded-lg bg-muted p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Avg Response Time</span>
                  </div>
                  <div className="text-2xl font-bold">{agent.stats.averageResponseTime}ms</div>
                </div>
              )}
              {agent.stats.uptime && (
                <div className="rounded-lg bg-muted p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Uptime</span>
                  </div>
                  <div className="text-2xl font-bold">{agent.stats.uptime}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Active Sessions */}
        {agent?.activeSessions && agent.activeSessions.length > 0 && (
          <div className="border-t pt-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Active Sessions ({agent.activeSessions.length})
            </h2>
            <div className="space-y-2">
              {agent.activeSessions.map((sessionId) => (
                <div key={sessionId} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="font-mono text-sm">{sessionId}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/sessions/${sessionId}`)}
                  >
                    View Details
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Additional Details */}
        <div className="border-t pt-6">
          <h2 className="text-lg font-semibold mb-4">Additional Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-sm text-muted-foreground">Created</div>
              <div className="font-medium">{formatDateTime(agent?.createdAt || '')}</div>
            </div>
            {agent?.updatedAt && (
              <div>
                <div className="text-sm text-muted-foreground">Last Updated</div>
                <div className="font-medium">{formatDateTime(agent.updatedAt)}</div>
              </div>
            )}
            {agent?.lastActivity && (
              <div>
                <div className="text-sm text-muted-foreground">Last Activity</div>
                <div className="font-medium">{formatDateTime(agent.lastActivity)}</div>
              </div>
            )}
          </div>

          {/* Metadata */}
          {agent?.metadata && Object.keys(agent.metadata).length > 0 && (
            <div className="mt-6">
              <div className="text-sm text-muted-foreground mb-2">Metadata</div>
              <pre className="bg-muted p-3 rounded-lg text-sm overflow-auto">
                {JSON.stringify(agent.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>

            {/* Connection Status Warning */}
            {!connected && (
              <div className="border-t pt-6 mt-6">
                <div className="flex items-center gap-2 text-yellow-600">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">
                    Not connected to OpenClaw. Some information may not be current.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'soul' && (
          /* Soul Tab */
          <div>
            {soulLoading ? (
              <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2 text-muted-foreground">Loading soul content...</span>
              </div>
            ) : (
              <div>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <Heart className="h-5 w-5" />
                    Agent Soul
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    The SOUL.md file defines the agent&apos;s personality, behavior, and core values. 
                    This is what makes the agent unique and guides its interactions.
                  </p>
                  {!soulExists && (
                    <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800">
                        <AlertCircle className="h-4 w-4 inline mr-2" />
                        No SOUL.md file exists for this agent. Create one to define its personality.
                      </p>
                    </div>
                  )}
                </div>
                
                <MarkdownEditor
                  initialContent={soulContent}
                  onSave={saveSoulContent}
                  placeholder="# SOUL.md - Who You Are

*You're not a chatbot. You're becoming someone.*

## Core Truths

**Be genuinely helpful, not performatively helpful.** Skip the filler words and just help. Actions speak louder than words.

## Personality

[Define your agent's personality, values, and approach here...]

## Boundaries

[Set clear boundaries for what the agent will and won't do...]

## Vibe

[Describe the tone and style the agent should adopt...]"
                  saveButtonText="Save Soul"
                  readOnly={!connected}
                  className="mt-4"
                />
                
                {!connected && (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <AlertCircle className="h-4 w-4 inline mr-2" />
                      Not connected to OpenClaw. Soul editing is read-only.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'memory' && (
          /* Memory Tab */
          <div>
            {filesLoading ? (
              <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2 text-muted-foreground">Loading memory files...</span>
              </div>
            ) : (
              <div>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    Agent Memory
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Memory files store the agent&apos;s knowledge, experiences, and learned information. 
                    MEMORY.md is the main file, while memory/*.md are additional topic-specific files.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* File Tree */}
                  <div className="lg:col-span-1">
                    <div className="border rounded-lg p-4">
                      <h3 className="font-medium mb-3">Memory Files</h3>
                      <FileTree
                        files={memoryFiles}
                        selectedFile={selectedMemoryFile}
                        onFileSelect={handleMemoryFileSelect}
                        onCreateFile={connected ? handleCreateMemoryFile : undefined}
                        loading={filesLoading}
                      />
                    </div>
                  </div>

                  {/* Editor */}
                  <div className="lg:col-span-2">
                    {selectedMemoryFile ? (
                      <div>
                        <div className="mb-4">
                          <h3 className="font-medium mb-1">Editing: {selectedMemoryFile}</h3>
                          <p className="text-sm text-muted-foreground">
                            {memoryExists ? 'File exists' : 'New file - will be created on save'}
                          </p>
                        </div>

                        {memoryLoading ? (
                          <div className="flex items-center justify-center min-h-[400px] border rounded-lg">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <span className="ml-2 text-muted-foreground">Loading file content...</span>
                          </div>
                        ) : (
                          <MarkdownEditor
                            initialContent={memoryContent}
                            onSave={saveMemoryContent}
                            placeholder={selectedMemoryFile === 'MEMORY.md' 
                              ? "# MEMORY.md\n\nLong-term notes and curated knowledge. Updated as I learn.\n\n---\n\n## Notes\n\n[Your memories and learnings here...]"
                              : "# " + selectedMemoryFile.replace('memory/', '').replace('.md', '') + "\n\n[Topic-specific memories and notes here...]"
                            }
                            saveButtonText="Save Memory"
                            readOnly={!connected}
                          />
                        )}

                        {!connected && (
                          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-sm text-yellow-800">
                              <AlertCircle className="h-4 w-4 inline mr-2" />
                              Not connected to OpenClaw. Memory editing is read-only.
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center min-h-[400px] border rounded-lg bg-muted/20">
                        <div className="text-center">
                          <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                          <h3 className="font-medium mb-2">No file selected</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            {memoryFiles.length > 0 
                              ? "Select a memory file from the list to edit it"
                              : "Create your first memory file to get started"
                            }
                          </p>
                          {memoryFiles.length === 0 && connected && (
                            <Button
                              size="sm"
                              onClick={() => handleCreateMemoryFile('MEMORY.md')}
                              disabled={!connected}
                            >
                              Create MEMORY.md
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-4 right-4 z-50">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg ${
              notification.type === 'success'
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            }`}
          >
            <span className="text-sm">{notification.message}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-white hover:text-gray-200"
              onClick={() => setNotification(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Configuration Modal */}
      <AgentConfigModal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        agent={agent}
        onSave={handleSaveConfig}
      />
    </div>
  );
}