"use client"

import { useEffect, useState, use } from "react"
import { MessageSquare, Menu } from "lucide-react"
import { useChatStore } from "@/lib/stores/chat-store"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { ChatThread } from "@/components/chat/chat-thread"
import { ChatInput } from "@/components/chat/chat-input"
import { ChatHeader } from "@/components/chat/chat-header"
import { ConvexChatSync } from "@/components/chat/convex-sync"
import { CreateTaskFromMessage } from "@/components/chat/create-task-from-message"
import { SessionInfoDropdown } from "@/components/chat/session-info-dropdown"
import { CompactContextBar } from "@/components/chat/compact-context-bar"
import { resetSession, compactSession } from "@/lib/openclaw"
import { Button } from "@/components/ui/button"
import { sendChatMessage, abortSession } from "@/lib/openclaw"
import { useSessionStore } from "@/lib/stores/session-store"
import type { ChatMessage } from "@/lib/types"
import type { SlashCommandResult } from "@/lib/slash-commands"

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
  const [lastSentAt, setLastSentAt] = useState<number | null>(null)
  const [pendingCompact, setPendingCompact] = useState(false)

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
    loadingMessages,
    typingIndicators,
    hasMoreMessages,
    fetchChats,
    createChat,
    sendMessage: sendMessageToDb,
    setActiveChat,
    setTyping,
    getLastActiveChatForProject,
  } = useChatStore()

  // Reset lastSentAt when switching chats to prevent stale "No activity" banner
  useEffect(() => {
    setLastSentAt(null)
  }, [activeChat?.id])

  // Generate session key based on project and active chat
  // Format: clutch:{projectSlug}:{chatId} - includes project for context
  // Use stored session_key if available, otherwise generate dynamically
  const sessionKey = activeChat
    ? (activeChat.session_key || `clutch:${slug}:${activeChat.id}`)
    : "main"

  // ==========================================================================
  // OpenClaw Integration (HTTP-only)
  // - HTTP POST for sending messages (reliable, works during gateway restarts)
  // - Message persistence handled server-side by clutch-channel plugin
  // - Convex reactive queries update the UI automatically
  // ==========================================================================

  // ==========================================================================
  // Sub-agent & session monitoring via HTTP RPC
  // ==========================================================================

  // useOpenClawHttpRpc removed - now using Convex reactive queries

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

  const [activeCrons, setActiveCrons] = useState<SubAgentDetails[]>([])
  const [gatewayStatus, setGatewayStatus] = useState<{
    startedAt?: string;
    uptime?: number;
    version?: string;
    uptimeString?: string;
  } | null>(null)

  // Get sessions from the global store (single source of truth)
  // SessionProvider in root layout handles the polling
  const sessions = useSessionStore((state) => state.sessions)

  // Derive session info for the active chat from shared store data
  const sessionInfo = ((): {
    model?: string;
    contextPercent?: number;
    tokensIn?: number;
    tokensOut?: number;
    tokensTotal?: number;
    cost?: number;
    createdAt?: number;
    updatedAt?: number;
    thinking?: boolean;
  } | null => {
    if (!activeChat?.session_key || !sessions) return null

    const session = sessions.find(
      (s) => s.id === activeChat.session_key
    ) || sessions.find(
      (s) => s.id.endsWith(activeChat.session_key!)
    )

    if (!session) return null

    const totalTokens = session.tokens_total ?? 0
    const contextWindow = 200000
    const contextPercent = contextWindow > 0 ? Math.round((totalTokens / contextWindow) * 100) : 0

    return {
      model: session.model ?? undefined,
      contextPercent,
      tokensIn: session.tokens_input ?? undefined,
      tokensOut: session.tokens_output ?? undefined,
      tokensTotal: totalTokens,
      createdAt: session.created_at ?? undefined,
      updatedAt: session.updated_at ?? undefined,
    }
  })()

  // Gateway status not available in HTTP-only mode
  // WebSocket was previously used for this - removed as part of WS cleanup
  useEffect(() => {
    setGatewayStatus(null)
  }, [])

  // Derive active crons from Convex agent sessions (reactive, no polling)
  // Note: Sub-agents are displayed via Convex directly; crons need separate tracking
  useEffect(() => {
    // Note: Cron sessions are not tracked in Convex task agent data
    // They remain empty for now - would need separate cron tracking in Convex
    setActiveCrons([])
  }, [])

  // ==========================================================================
  // Project init & chat selection
  // ==========================================================================

  // Single init effect — handles both initial load and project switches.
  // Clearing stale state and loading new data happens in one sequential flow,
  // eliminating races between separate effects.
  useEffect(() => {
    let cancelled = false

    async function init() {
      // Clear stale state from previous project
      setActiveChat(null)
      setProjectId(null)
      setProject(null)
      setProjectContext(null)

      const response = await fetch(`/api/projects/${slug}`)
      if (cancelled || !response.ok) return

      const data = await response.json()
      setProject(data.project)
      setProjectId(data.project.id)
      await fetchChats(data.project.id)

      if (cancelled) return

      try {
        const contextResponse = await fetch(`/api/projects/${slug}/context`)
        if (!cancelled && contextResponse.ok) {
          const contextData = await contextResponse.json()
          setProjectContext(contextData.formatted || null)
        }
      } catch (error) {
        console.error("[Chat] Failed to fetch project context:", error)
      }
    }

    init()
    return () => { cancelled = true }
  }, [slug, fetchChats, setActiveChat])

  // Auto-select chat when project loads: prefer last active chat for this project,
  // fall back to first chat if no previous selection or chat no longer exists
  useEffect(() => {
    if (chats.length > 0 && !activeChat && projectId) {
      const lastActiveChatId = getLastActiveChatForProject(projectId)
      const lastActiveChat = lastActiveChatId
        ? chats.find((c) => c.id === lastActiveChatId)
        : null

      if (lastActiveChat) {
        setActiveChat(lastActiveChat)
      } else {
        setActiveChat(chats[0])
      }
    }
  }, [chats, activeChat, setActiveChat, projectId, getLastActiveChatForProject])

  // ==========================================================================
  // Message sending
  // ==========================================================================

  const handleSendMessage = async (content: string, images?: string[]) => {
    if (!activeChat) return

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

    // Record send timestamp for pipeline status tracking
    setLastSentAt(Date.now())

    // Show thinking indicator immediately (optimistic local update)
    void setTyping(activeChat.id, "ada", "thinking")

    // Also write to Convex so the agent_end clear (which only clears Convex)
    // has something to delete. Without this, the local indicator persists because
    // Convex never had a typing state to clear, so the subscription never fires.
    void fetch(`/api/chats/${activeChat.id}/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typing: true, author: "ada", state: "thinking" }),
    })

    // Build message for OpenClaw (include project context on first message)
    let openClawMessage = messageContent
    if (isFirstMessage && projectContext) {
      openClawMessage = `[Project Context]\n\n${projectContext}\n\n---\n\n[User Message]\n\n${messageContent}`
    }

    // Send to OpenClaw via HTTP POST
    // Response persistence is handled by the clutch-channel plugin (agent_end hook)
    try {
      await sendChatMessage(sessionKey, openClawMessage)
    } catch (error) {
      console.error("[Chat] Failed to send to OpenClaw:", error)
      // Clear typing indicator on send failure (both local and Convex)
      void setTyping(activeChat.id, "ada", false)
      setLastSentAt(null) // Clear lastSentAt on error
      void fetch(`/api/chats/${activeChat.id}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typing: false, author: "ada" }),
      })
    }
  }

  const handleStopChat = async () => {
    if (!activeChat) return

    try {
      await abortSession(sessionKey)
    } catch (error) {
      console.error("[Chat] Failed to abort chat:", error)
    } finally {
      void setTyping(activeChat.id, "ada", false)
      setLastSentAt(null)
      // Also clear Convex typing in case abort doesn't trigger agent_end cleanly
      void fetch(`/api/chats/${activeChat.id}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typing: false, author: "ada" }),
      })
      await sendMessageToDb(activeChat.id, "_Response cancelled by user_", "system")
    }
  }

  const handleResetSession = async () => {
    if (!activeChat?.session_key) return

    try {
      await resetSession(activeChat.session_key)
      setLastSentAt(null)
      await sendMessageToDb(activeChat.id, "_Session reset. Context cleared._", "system")
    } catch (error) {
      console.error("[Chat] Failed to reset session:", error)
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

  // ==========================================================================
  // Slash command handler
  // ==========================================================================

  const handleSlashCommand = async (result: SlashCommandResult) => {
    if (!activeChat || !projectId) return

    // Show command response in chat
    if (result.response) {
      await sendMessageToDb(activeChat.id, result.response, "system")
    }

    // Handle post-command actions
    if (result.action === "clear_chat") {
      // Clear the local message cache so old messages disappear from UI
      // New messages will appear via Convex reactive sync as they come in
      useChatStore.getState().syncMessages(activeChat.id, [])
    } else if (result.action === "refresh_session") {
      // Refresh session info (for /model command)
      // The session info effect will pick up the change automatically
    } else if (result.action === "create_chat") {
      // Create a new chat with the optional title from the /new command
      const newChat = await createChat(projectId, result.title)
      setActiveChat({ ...newChat, lastMessage: null })
    } else if (result.action === "compact_after_response") {
      // Set flag to trigger compaction after agent responds
      setPendingCompact(true)
    }
  }

  const currentMessages = activeChat ? messages[activeChat.id] || [] : []

  // Clear lastSentAt when agent response arrives (typing indicator clears)
  // Also triggers pending compaction after agent responds to /compact command
  useEffect(() => {
    if (activeChat && lastSentAt) {
      const isTyping = (typingIndicators[activeChat.id] || []).some(t => t.author === "ada")
      // If we were waiting and now typing stopped, clear lastSentAt
      if (!isTyping) {
        // Check if we got new messages since sending
        const lastMessage = currentMessages[currentMessages.length - 1]
        if (lastMessage && lastMessage.author !== "dan" && lastMessage.created_at > lastSentAt) {
          setLastSentAt(null)

          // Trigger compaction if pending (from /compact command)
          if (pendingCompact) {
            setPendingCompact(false)
            void compactSession(sessionKey).then(() => {
              void sendMessageToDb(activeChat.id, "_Session compacted. Context summarized._", "system")
            }).catch((error) => {
              console.error("[Chat] Failed to compact session:", error)
              void sendMessageToDb(activeChat.id, "_Failed to compact session._", "system")
            })
          }
        }
      }
    }
  }, [activeChat, typingIndicators, currentMessages, lastSentAt, pendingCompact, sessionKey, sendMessageToDb])

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <>
      {/* Convex reactive sync — bridges real-time data into zustand store */}
      <ConvexChatSync key={slug} chatId={activeChat?.id ?? null} projectId={projectId} />

      <div className="flex h-[calc(100vh-100px)] md:h-[calc(100vh-140px)] bg-[var(--bg-primary)] rounded-lg border border-[var(--border)] overflow-hidden min-w-0 max-w-full">
        <ChatSidebar
          projectId={projectId}
          projectSlug={slug}
          isOpen={isMobile ? sidebarOpen : true}
          onClose={() => setSidebarOpen(false)}
          isMobile={isMobile}
        />

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

                {/* Desktop: Full session info dropdown */}
                <div className="hidden md:block px-2 md:px-4 py-1.5 md:py-2 border-t border-[var(--border)]/50 bg-[var(--bg-secondary)]/30">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0" />
                    <div className="flex items-center gap-2 md:gap-3">
                      <SessionInfoDropdown
                        sessionKey={sessionKey}
                        projectId={projectId || undefined}
                        projectSlug={slug}
                        sessionDetails={sessionInfo || undefined}
                        connected={true} // HTTP is always "connected"
                        gatewayStatus={gatewayStatus || undefined}
                        onResetSession={activeChat?.session_key ? () => resetSession(activeChat.session_key!) : undefined}
                        onToggleThinking={() => {
                          // TODO: Implement thinking mode toggle via API
                          console.log("Toggle thinking mode - not yet implemented")
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Mobile: Compact context bar */}
                <div className="md:hidden border-t border-[var(--border)]/50 bg-[var(--bg-secondary)]/30">
                  <CompactContextBar sessionKey={sessionKey} />
                </div>
              </div>

              <ChatThread
                chatId={activeChat.id}
                messages={currentMessages}
                loading={loadingMessages}
                onCreateTask={handleCreateTask}
                typingIndicators={typingIndicators[activeChat.id] || []}
                chatLayout={project?.chat_layout || 'slack'}
                activeCrons={activeCrons}
                projectSlug={slug}
                hasMore={hasMoreMessages[activeChat.id] ?? false}
              />

              <ChatInput
                onSend={handleSendMessage}
                onStop={handleStopChat}
                onSlashCommand={handleSlashCommand}
                onReset={handleResetSession}
                isAssistantTyping={activeChat ? (typingIndicators[activeChat.id] || []).some(t => t.author === "ada") : false}
                sessionKey={sessionKey}
                projectId={projectId ?? undefined}
                lastSentAt={lastSentAt}
                isMobile={isMobile}
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