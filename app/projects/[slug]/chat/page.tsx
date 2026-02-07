"use client"

import { useEffect, useState, use } from "react"
import { MessageSquare, Menu } from "lucide-react"
import { useChatStore } from "@/lib/stores/chat-store"
import { useSettings } from "@/lib/hooks/use-settings"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { ChatThread } from "@/components/chat/chat-thread"
import { ChatInput } from "@/components/chat/chat-input"
import { ChatHeader } from "@/components/chat/chat-header"
import { ConvexChatSync } from "@/components/chat/convex-sync"
import { CreateTaskFromMessage } from "@/components/chat/create-task-from-message"
import { StreamingToggle } from "@/components/chat/streaming-toggle"
import { SessionInfoDropdown } from "@/components/chat/session-info-dropdown"
import { Button } from "@/components/ui/button"
import { sendChatMessage, abortSession, patchSession, resetSession } from "@/lib/openclaw"
import { useOpenClawHttpRpc } from "@/lib/hooks/use-openclaw-http"
import type { ChatMessage } from "@/lib/types"

type PageProps = {
  params: Promise<{ slug: string }>
}

interface ProjectInfo {
  id: string
  slug: string
  name: string
  description: string | null
  local_path: string | null
  github_repo: string | null
  chat_layout?: 'slack' | 'imessage'
}

export default function ChatPage({ params }: PageProps) {
  const { slug } = use(params)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [projectContext, setProjectContext] = useState<string | null>(null)
  const [createTaskMessage, setCreateTaskMessage] = useState<ChatMessage | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024) // lg breakpoint
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const {
    chats,
    activeChat,
    messages,
    streamingMessages,
    loadingMessages,
    typingIndicators,
    fetchChats,
    sendMessage: sendMessageToDb,
    setActiveChat,
    setTyping,
    clearStreamingMessage,
  } = useChatStore()

  // Settings for streaming toggle
  const { settings, toggleStreaming } = useSettings()

  // Generate session key based on project and active chat
  // Format: trap:{projectSlug}:{chatId} - includes project for context
  const sessionKey = activeChat ? `trap:${slug}:${activeChat.id}` : "main"

  // ==========================================================================
  // OpenClaw Integration (HTTP-only)
  // - HTTP POST for sending messages (reliable, works during gateway restarts)
  // - Message persistence handled server-side by trap-channel plugin
  // - Convex reactive queries update the UI automatically
  // - WebSocket/SSE removed - streaming now handled via Convex
  // ==========================================================================

  // ==========================================================================
  // Sub-agent & session monitoring via HTTP RPC
  // ==========================================================================

  const { listSessions } = useOpenClawHttpRpc()

  interface SubAgentDetails {
    key: string
    label?: string
    model?: string
    status?: string
    agentId?: string
    createdAt?: number
    updatedAt?: number
    runtime?: string
    isCron?: boolean
    totalTokens?: number
    contextTokens?: number
    taskTitle?: string
    taskId?: string
    projectSlug?: string
  }

  const [activeSubagents, setActiveSubagents] = useState<SubAgentDetails[]>([])
  const [activeCrons, setActiveCrons] = useState<SubAgentDetails[]>([])
  const [sessionInfo, setSessionInfo] = useState<{ model?: string; contextPercent?: number } | null>(null)
  const [gatewayStatus, setGatewayStatus] = useState<{
    startedAt?: string;
    uptime?: number;
    version?: string;
    uptimeString?: string;
  } | null>(null)

  // Fetch session info from the CLI-backed sessions endpoint (no WS dependency)
  useEffect(() => {
    async function fetchSessionInfo() {
      if (!activeChat?.session_key) {
        setSessionInfo(null)
        return
      }

      try {
        const response = await fetch("/api/sessions/list?activeMinutes=60&limit=200", {
          signal: AbortSignal.timeout(10000),
        })
        if (!response.ok) {
          setSessionInfo(null)
          return
        }
        const data = await response.json()
        const sessions: Array<Record<string, unknown>> = data.sessions || []
        // Session IDs from the CLI endpoint use the key directly
        const session = sessions.find((s) => s.id === activeChat.session_key)
          || sessions.find((s) => String(s.id || "").endsWith(activeChat.session_key!))
        if (session) {
          const tokens = session.tokens as { total?: number } | undefined
          const totalTokens = tokens?.total || 0
          // Estimate context window from model (200k default)
          const contextWindow = 200000
          const contextPercent = contextWindow > 0 ? Math.round((totalTokens / contextWindow) * 100) : 0
          setSessionInfo({
            model: session.model as string,
            contextPercent,
          })
        } else {
          setSessionInfo(null)
        }
      } catch {
        // Endpoint may be unavailable
        setSessionInfo(null)
      }
    }

    fetchSessionInfo()
    // Refresh every 30s
    const interval = setInterval(fetchSessionInfo, 30000)
    return () => clearInterval(interval)
  }, [activeChat?.session_key])

  // Gateway status not available in HTTP-only mode
  // WebSocket was previously used for this - removed as part of WS cleanup
  useEffect(() => {
    setGatewayStatus(null)
  }, [])

  // Poll for active sub-agents and cron sessions
  useEffect(() => {
    const pollSubagents = async () => {
      try {
        const response = await listSessions({ limit: 50 })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sessions = response.sessions as any[]
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000

        // Helper to format runtime
        const formatRuntime = (createdAt?: number): string | undefined => {
          if (!createdAt) return undefined
          const runtimeMs = Date.now() - createdAt
          const minutes = Math.floor(runtimeMs / 60000)
          const hours = Math.floor(runtimeMs / (60000 * 60))
          if (hours > 0) {
            const remainingMinutes = minutes % 60
            return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
          }
          return minutes > 0 ? `${minutes}m` : `${Math.floor(runtimeMs / 1000)}s`
        }

        // Helper to extract task ID from session label
        const extractTaskId = (label?: string): string | undefined => {
          if (!label) return undefined
          // Match patterns like "trap-5e411423" or just "5e411423"
          const match = label.match(/(?:trap-)?([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})/i)
          return match ? match[1] : undefined
        }

        // Fetch task titles for sub-agents
        const taskCache = new Map<string, { title: string; projectSlug?: string }>()
        const fetchTaskTitle = async (taskId: string): Promise<{ title: string; projectSlug?: string } | null> => {
          if (taskCache.has(taskId)) return taskCache.get(taskId)!
          try {
            const res = await fetch(`/api/tasks/${taskId}`)
            if (res.ok) {
              const data = await res.json()
              const result = { title: data.task?.title || data.title, projectSlug: data.task?.project_slug }
              taskCache.set(taskId, result)
              return result
            }
          } catch {
            // Ignore fetch errors
          }
          return null
        }

        // Process sub-agents
        const subagentPromises = (sessions || [])
          .filter((s) =>
            s.spawnedBy === "agent:main:main" &&
            s.updatedAt && s.updatedAt > fiveMinutesAgo &&
            !s.key?.includes(":cron:")
          )
          .map(async (s) => {
            const runtime = formatRuntime(s.createdAt)
            const taskId = extractTaskId(s.label)
            let taskTitle: string | undefined
            let taskProjectSlug: string | undefined
            
            if (taskId) {
              const taskInfo = await fetchTaskTitle(taskId)
              if (taskInfo) {
                taskTitle = taskInfo.title
                taskProjectSlug = taskInfo.projectSlug
              }
            }
            
            return {
              key: s.key as string,
              label: s.label as string | undefined,
              model: s.model as string | undefined,
              status: s.status as string | undefined,
              agentId: s.agentId as string | undefined,
              createdAt: s.createdAt as number | undefined,
              updatedAt: s.updatedAt as number | undefined,
              runtime,
              isCron: false,
              totalTokens: s.totalTokens as number | undefined,
              contextTokens: s.contextTokens as number | undefined,
              taskTitle,
              taskId,
              projectSlug: taskProjectSlug || slug,
            }
          })

        // Process cron jobs
        const cronPromises = (sessions || [])
          .filter((s) => s.updatedAt && s.updatedAt > fiveMinutesAgo && s.key?.includes(":cron:"))
          .map(async (s) => {
            const runtime = formatRuntime(s.createdAt)
            let cronLabel = s.label
            if (!cronLabel && s.key) {
              const trapTaskMatch = s.key.match(/:trap-(.+)$/)
              if (trapTaskMatch) {
                const taskId = trapTaskMatch[1]
                const taskInfo = await fetchTaskTitle(taskId)
                cronLabel = taskInfo?.title || `Trap: ${taskId.substring(0, 8)}`
              } else {
                const cronIdMatch = s.key.match(/:cron:([^:]+)/)
                cronLabel = cronIdMatch ? `Cron Job ${cronIdMatch[1].substring(0, 8)}...` : "Cron Job"
              }
            }
            return {
              key: s.key as string,
              label: cronLabel as string | undefined,
              model: s.model as string | undefined,
              status: s.status as string | undefined,
              agentId: s.agentId as string | undefined,
              createdAt: s.createdAt as number | undefined,
              updatedAt: s.updatedAt as number | undefined,
              runtime,
              isCron: true,
              totalTokens: s.totalTokens as number | undefined,
              contextTokens: s.contextTokens as number | undefined,
            }
          })

        const [subagents, crons] = await Promise.all([
          Promise.all(subagentPromises),
          Promise.all(cronPromises),
        ])

        setActiveSubagents(subagents)
        setActiveCrons(crons)
      } catch {
        // OpenClaw RPC may be unavailable — silently ignore
      }
    }

    pollSubagents()
    const interval = setInterval(pollSubagents, 10000)
    return () => clearInterval(interval)
  }, [listSessions, slug])

  // ==========================================================================
  // Project init & chat selection
  // ==========================================================================

  useEffect(() => {
    async function init() {
      const response = await fetch(`/api/projects/${slug}`)
      if (response.ok) {
        const data = await response.json()
        setProject(data.project)
        setProjectId(data.project.id)
        await fetchChats(data.project.id)

        try {
          const contextResponse = await fetch(`/api/projects/${slug}/context`)
          if (contextResponse.ok) {
            const contextData = await contextResponse.json()
            setProjectContext(contextData.formatted || null)
          }
        } catch (error) {
          console.error("[Chat] Failed to fetch project context:", error)
        }
      }
    }
    init()
  }, [slug, fetchChats])

  useEffect(() => {
    if (chats.length > 0 && !activeChat) {
      setActiveChat(chats[0])
    }
  }, [chats, activeChat, setActiveChat])

  // ==========================================================================
  // Slash Command Handling
  // ==========================================================================

  const KNOWN_SLASH_COMMANDS = ['new', 'status', 'model', 'help'];

  /**
   * Parse and execute slash commands.
   * Returns true if the message was handled as a command, false if it should be sent as a regular message.
   */
  const handleSlashCommand = async (content: string): Promise<boolean> => {
    if (!content.startsWith('/')) return false;

    const trimmed = content.trim();
    const match = trimmed.match(/^\/([a-zA-Z0-9_-]+)(?:\s+(.*))?$/);
    if (!match) {
      // Message starts with / but isn't a valid command format
      return false;
    }

    const [, command, args] = match;
    const normalizedCommand = command.toLowerCase();

    // Check if it's a known command
    if (!KNOWN_SLASH_COMMANDS.includes(normalizedCommand)) {
      // Unknown command - let it send as message but warn user
      return false;
    }

    // Execute the command
    switch (normalizedCommand) {
      case 'new': {
        // Reset the session
        try {
          await resetSession(sessionKey);
          // Clear local chat history
          if (activeChat) {
            // Send system message about reset
            await sendMessageToDb(activeChat.id, "🔄 Session reset. Starting fresh conversation.", "system");
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (activeChat) {
            await sendMessageToDb(activeChat.id, `❌ Failed to reset session: ${errorMsg}`, "system");
          }
        }
        return true;
      }

      case 'status': {
        // Show session status
        try {
          const response = await fetch(`/api/sessions/list?activeMinutes=60&limit=200`, {
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const data = await response.json();
          const sessions: Array<Record<string, unknown>> = data.sessions || [];
          const session = sessions.find((s) => s.id === sessionKey);

          if (session) {
            const tokens = session.tokens as { total?: number; input?: number; output?: number } | undefined;
            const model = session.model as string | undefined;
            const statusText = [
              `📊 **Session Status**`,
              `**Key:** ${sessionKey}`,
              `**Model:** ${model || 'unknown'}`,
              `**Tokens:** ${tokens?.total || 0} total (${tokens?.input || 0} in / ${tokens?.output || 0} out)`,
            ].join('\n');
            if (activeChat) {
              await sendMessageToDb(activeChat.id, statusText, "system");
            }
          } else {
            const notFoundText = `📊 **Session Status**\n\nSession "${sessionKey}" not found. This may be a new session.`;
            if (activeChat) {
              await sendMessageToDb(activeChat.id, notFoundText, "system");
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (activeChat) {
            await sendMessageToDb(activeChat.id, `❌ Failed to get status: ${errorMsg}`, "system");
          }
        }
        return true;
      }

      case 'model': {
        // Switch model
        const modelName = args?.trim();
        if (!modelName) {
          if (activeChat) {
            await sendMessageToDb(activeChat.id, "❌ Model name required. Usage: `/model <name>`\n\nExamples:\n- `/model sonnet`\n- `/model moonshot/kimi-for-coding`\n- `/model anthropic/claude-opus-4-6`", "system");
          }
          return true;
        }

        try {
          await patchSession(sessionKey, { model: modelName });
          if (activeChat) {
            await sendMessageToDb(activeChat.id, `🔄 Model switched to **${modelName}**`, "system");
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (activeChat) {
            await sendMessageToDb(activeChat.id, `❌ Failed to switch model: ${errorMsg}`, "system");
          }
        }
        return true;
      }

      case 'help': {
        const helpText = [
          '**Available Commands:**',
          '',
          '`/new` - Reset the current session (start fresh)',
          '`/status` - Show session info (model, tokens, etc.)',
          '`/model <name>` - Switch to a different model',
          '`/help` - Show this help message',
          '',
          'Messages starting with `/` that are not recognized commands will be sent as regular messages.',
        ].join('\n');
        if (activeChat) {
          await sendMessageToDb(activeChat.id, helpText, "system");
        }
        return true;
      }

      default:
        return false;
    }
  };

  // ==========================================================================
  // Message sending
  // ==========================================================================

  const handleSendMessage = async (content: string, images?: string[]) => {
    if (!activeChat) return

    // Check for slash commands first (before images, since commands don't support images)
    if (content.startsWith('/') && (!images || images.length === 0)) {
      const handled = await handleSlashCommand(content);
      if (handled) {
        return; // Command was processed, don't send as regular message
      }

      // Check if it's an unknown command format (/word but not in known list)
      const match = content.trim().match(/^\/([a-zA-Z0-9_-]+)(?:\s+.*)?$/);
      if (match) {
        const command = match[1].toLowerCase();
        if (!KNOWN_SLASH_COMMANDS.includes(command)) {
          // Unknown command - send as message with warning
          await sendMessageToDb(
            activeChat.id,
            `⚠️ Unknown command \`/${command}\`. Sending as regular message. Type \`/help\` for available commands.`,
            "system"
          );
        }
      }
    }

    const isFirstMessage = !activeChat.session_key

    // Store session key on first message
    if (isFirstMessage) {
      try {
        await fetch(`/api/chats/${activeChat.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_key: sessionKey }),
        })
        setActiveChat({ ...activeChat, session_key: sessionKey })
      } catch (error) {
        console.error("[Chat] Failed to store session key:", error)
      }
    }

    // Prepare message content with images
    let messageContent = content
    if (images && images.length > 0) {
      const imageMarkdown = images.map(url => `![Image](${url})`).join("\n")
      messageContent = content ? `${content}\n\n${imageMarkdown}` : imageMarkdown
    }

    // Save user message to Convex
    await sendMessageToDb(activeChat.id, messageContent, "dan")

    // Show thinking indicator immediately (optimistic)
    setTyping(activeChat.id, "ada", "thinking")

    // Build message for OpenClaw (include project context on first message)
    let openClawMessage = messageContent
    if (isFirstMessage && projectContext) {
      openClawMessage = `[Project Context]\n\n${projectContext}\n\n---\n\n[User Message]\n\n${messageContent}`
    }

    // Send to OpenClaw via HTTP POST
    // Response persistence is handled by the trap-channel plugin (agent_end hook)
    try {
      await sendChatMessage(sessionKey, openClawMessage)
    } catch (error) {
      console.error("[Chat] Failed to send to OpenClaw:", error)
      // Clear typing indicator on send failure
      setTyping(activeChat.id, "ada", false)
    }
  }

  const handleStopChat = async () => {
    if (!activeChat) return

    try {
      await abortSession(sessionKey)
    } catch (error) {
      console.error("[Chat] Failed to abort chat:", error)
    } finally {
      setTyping(activeChat.id, "ada", false)
      clearStreamingMessage(activeChat.id)
      await sendMessageToDb(activeChat.id, "_Response cancelled by user_", "system")
    }
  }

  const handleCreateTask = (message: ChatMessage) => {
    setCreateTaskMessage(message)
  }

  const handleTaskCreated = async () => {
    if (activeChat) {
      await sendMessageToDb(
        activeChat.id,
        `📋 Created task from this conversation. Check the board for details.`,
        "dan"
      )
    }
  }

  const currentMessages = activeChat ? messages[activeChat.id] || [] : []

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <>
      {/* Convex reactive sync — bridges real-time data into zustand store */}
      <ConvexChatSync chatId={activeChat?.id ?? null} projectId={projectId} />

      <div className="flex h-[calc(100vh-140px)] bg-[var(--bg-primary)] rounded-lg border border-[var(--border)] overflow-hidden min-w-0 max-w-full">
        {projectId && (
          <ChatSidebar
            projectId={projectId}
            projectSlug={slug}
            isOpen={isMobile ? sidebarOpen : true}
            onClose={() => setSidebarOpen(false)}
            isMobile={isMobile}
          />
        )}

        <div className="flex-1 flex flex-col min-w-0 max-w-full overflow-hidden">
          {activeChat ? (
            <>
              <div className="border-b border-[var(--border)]">
                <div className="flex items-center">
                  {isMobile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSidebarOpen(true)}
                      className="lg:hidden p-2 m-1"
                    >
                      <Menu className="h-4 w-4" />
                    </Button>
                  )}
                  <div className="flex-1">
                    <ChatHeader chat={activeChat} />
                  </div>
                </div>

                <div className="px-2 md:px-4 py-1.5 md:py-2 border-t border-[var(--border)]/50 bg-[var(--bg-secondary)]/30">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0" />
                    <div className="flex items-center gap-2 md:gap-3">
                      <StreamingToggle
                        enabled={settings.streamingEnabled}
                        onChange={toggleStreaming}
                      />
                      <SessionInfoDropdown
                        sessionKey={sessionKey}
                        sessionInfo={sessionInfo || undefined}
                        connected={true} // HTTP is always "connected"
                        activeSubagents={activeSubagents}
                        activeCrons={activeCrons}
                        gatewayStatus={gatewayStatus || undefined}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <ChatThread
                chatId={activeChat.id}
                messages={currentMessages}
                streamingMessage={activeChat ? streamingMessages[activeChat.id] || null : null}
                loading={loadingMessages}
                onCreateTask={handleCreateTask}
                typingIndicators={typingIndicators[activeChat.id] || []}
                chatLayout={project?.chat_layout || 'slack'}
                activeCrons={activeCrons}
                projectSlug={slug}
              />

              <ChatInput
                onSend={handleSendMessage}
                onStop={handleStopChat}
                isAssistantTyping={activeChat ? (typingIndicators[activeChat.id] || []).some(t => t.author === "ada") : false}
                sessionKey={sessionKey}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 mx-auto text-[var(--text-muted)] mb-4" />
                <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                  Select a chat
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  Choose a chat from the sidebar or create a new one
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {createTaskMessage && projectId && (
        <CreateTaskFromMessage
          message={createTaskMessage}
          projectId={projectId}
          open={!!createTaskMessage}
          onOpenChange={(open) => !open && setCreateTaskMessage(null)}
          onCreated={handleTaskCreated}
        />
      )}
    </>
  )
}
