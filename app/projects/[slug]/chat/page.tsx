"use client"

import { useEffect, useState, use, useCallback } from "react"
import { MessageSquare, Menu } from "lucide-react"
import { useChatStore } from "@/lib/stores/chat-store"
import { useChatEvents } from "@/lib/hooks/use-chat-events"
import { useOpenClawChat } from "@/lib/hooks/use-openclaw-chat"
import { useOpenClawRpc } from "@/lib/hooks/use-openclaw-rpc"
import { useSettings } from "@/lib/hooks/use-settings"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { ChatThread } from "@/components/chat/chat-thread"
import { ChatInput } from "@/components/chat/chat-input"
import { ChatHeader } from "@/components/chat/chat-header"
import { CreateTaskFromMessage } from "@/components/chat/create-task-from-message"
import { StreamingToggle } from "@/components/chat/streaming-toggle"
import { SessionInfoDropdown } from "@/components/chat/session-info-dropdown"
import { Button } from "@/components/ui/button"
import type { ChatMessage } from "@/lib/db/types"

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
    refreshMessages,
    sendMessage: sendMessageToDb,
    setActiveChat,
    receiveMessage,
    setTyping,
    startStreamingMessage,
    appendToStreamingMessage,
    clearStreamingMessage,
  } = useChatStore()

  // Settings for streaming toggle
  const { settings, toggleStreaming } = useSettings()

  // OpenClaw WebSocket connection for main session
  const handleOpenClawMessage = useCallback(async (msg: { role: string; content: string | Array<{ type: string; text?: string }> }, runId: string) => {
    console.log("[Chat] onMessage (WebSocket) received, runId:", runId)
    if (!activeChat) {
      console.log("[Chat] No activeChat, ignoring message")
      return
    }
    
    // Clear streaming message if we were streaming
    if (settings.streamingEnabled && streamingMessages[activeChat.id]?.runId === runId) {
      clearStreamingMessage(activeChat.id)
    }
    
    // Extract text from content
    const text = typeof msg.content === "string" 
      ? msg.content 
      : msg.content.find(c => c.type === "text")?.text || ""
    
    // Save Ada's response to local DB
    console.log("[Chat] Saving message to Trap DB for chat:", activeChat.id, "runId:", runId)
    fetch(`/api/chats/${activeChat.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, author: "ada", run_id: runId }),
    }).catch(console.error)
  }, [activeChat, settings.streamingEnabled, streamingMessages, clearStreamingMessage])

  const handleOpenClawTypingStart = useCallback(() => {
    if (activeChat) {
      setTyping(activeChat.id, "ada", "thinking")
    }
  }, [activeChat, setTyping])

  const handleOpenClawTypingEnd = useCallback(() => {
    if (activeChat) {
      setTyping(activeChat.id, "ada", false)
    }
  }, [activeChat, setTyping])

  const handleOpenClawDelta = useCallback((delta: string, runId: string) => {
    if (!activeChat) return
    
    // Switch from "thinking" to "typing" on first delta
    setTyping(activeChat.id, "ada", "typing")
    
    // Handle streaming if enabled
    if (settings.streamingEnabled) {
      // If this is the first delta for this runId, start a new streaming message
      if (!streamingMessages[activeChat.id] || streamingMessages[activeChat.id].runId !== runId) {
        startStreamingMessage(activeChat.id, runId, "ada")
      }
      
      // Append the delta to the streaming message
      appendToStreamingMessage(activeChat.id, delta)
    }
  }, [activeChat, setTyping, settings.streamingEnabled, streamingMessages, startStreamingMessage, appendToStreamingMessage])

  // Generate session key based on project and active chat
  // Format: trap:{projectSlug}:{chatId} - includes project for context
  const sessionKey = activeChat ? `trap:${slug}:${activeChat.id}` : "main"

  const { connected: openClawConnected, sendMessage: sendToOpenClaw, abortChat } = useOpenClawChat({
    sessionKey,
    onMessage: handleOpenClawMessage,
    onDelta: handleOpenClawDelta,
    onTypingStart: handleOpenClawTypingStart,
    onTypingEnd: handleOpenClawTypingEnd,
  })

  // Sub-agent monitoring via RPC
  const { connected: rpcConnected, listSessions, getSessionPreview } = useOpenClawRpc()
  
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
  }
  
  const [activeSubagents, setActiveSubagents] = useState<SubAgentDetails[]>([])
  const [activeCrons, setActiveCrons] = useState<SubAgentDetails[]>([])
  const [sessionInfo, setSessionInfo] = useState<{ model?: string; contextPercent?: number } | null>(null)

  // Fetch session info when chat has session_key and RPC is connected
  useEffect(() => {
    async function fetchSessionInfo() {
      if (!activeChat?.session_key || !rpcConnected) {
        setSessionInfo(null)
        return
      }

      try {
        const preview = await getSessionPreview(activeChat.session_key)
        if (preview?.session) {
          setSessionInfo({
            model: preview.session.model,
            contextPercent: preview.contextPercentage ? Math.round(preview.contextPercentage) : undefined,
          })
        } else {
          setSessionInfo(null)
        }
      } catch (error) {
        console.error("[Chat] Failed to fetch session info:", error)
        setSessionInfo(null)
      }
    }

    fetchSessionInfo()
  }, [activeChat?.session_key, rpcConnected, getSessionPreview])

  useEffect(() => {
    if (!rpcConnected) return
    
    const pollSubagents = async () => {
      try {
        const response = await listSessions({ limit: 10 })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sessions = response.sessions as any[]
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
        
        // Filter for sessions that are:
        // 1. Spawned by main session (sub-agents)
        // 2. Updated in the last 5 minutes (still active)
        const subagents = (sessions || [])
          .filter((s) => 
            s.spawnedBy === "agent:main:main" && 
            s.updatedAt && s.updatedAt > fiveMinutesAgo
          )
          .map((s) => {
            // Calculate runtime if we have creation time
            let runtime: string | undefined
            if (s.createdAt) {
              const runtimeMs = Date.now() - s.createdAt
              const minutes = Math.floor(runtimeMs / 60000)
              const seconds = Math.floor((runtimeMs % 60000) / 1000)
              runtime = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
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
            }
          })

        // Filter for cron sessions
        // Identify cron sessions by their key pattern: agent:main:cron:UUID
        const crons = (sessions || [])
          .filter((s) => {
            // Look for sessions with cron in their key that are recently active
            const isRecentlyActive = s.updatedAt && s.updatedAt > fiveMinutesAgo
            const isCronSession = s.key && s.key.includes(":cron:")
            
            return isRecentlyActive && isCronSession
          })
          .map((s) => {
            // Calculate runtime if we have creation time
            let runtime: string | undefined
            if (s.createdAt) {
              const runtimeMs = Date.now() - s.createdAt
              const minutes = Math.floor(runtimeMs / 60000)
              const seconds = Math.floor((runtimeMs % 60000) / 1000)
              runtime = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
            }
            
            // Extract cron job ID from key for display
            let cronLabel = s.label
            if (!cronLabel && s.key) {
              const cronIdMatch = s.key.match(/:cron:([^:]+)$/)
              cronLabel = cronIdMatch ? `Cron Job ${cronIdMatch[1].substring(0, 8)}...` : s.key
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
            }
          })

        setActiveSubagents(subagents)
        setActiveCrons(crons)
      } catch (err) {
        console.error("[Chat] Failed to poll subagents:", err)
      }
    }
    
    pollSubagents()
    const interval = setInterval(pollSubagents, 10000) // Poll every 10s
    return () => clearInterval(interval)
  }, [rpcConnected, listSessions])

  // SSE subscription for real-time local updates
  const handleNewMessage = useCallback((message: ChatMessage) => {
    if (activeChat) {
      receiveMessage(activeChat.id, message)
    }
  }, [activeChat, receiveMessage])

  const handleTyping = useCallback((author: string, typing: boolean) => {
    if (activeChat) {
      setTyping(activeChat.id, author, typing ? "typing" : false)
    }
  }, [activeChat, setTyping])

  // Refetch messages when tab becomes visible (after being hidden)
  const handleRefreshMessages = useCallback(() => {
    if (activeChat) {
      console.log("[Chat] Refetching messages due to tab visibility change")
      // Seamlessly refresh messages without loading state
      refreshMessages(activeChat.id)
    }
  }, [activeChat, refreshMessages])

  useChatEvents({
    chatId: activeChat?.id || "",
    onMessage: handleNewMessage,
    onTyping: handleTyping,
    onRefreshMessages: handleRefreshMessages,
    enabled: Boolean(activeChat),
  })

  // Fetch project to get ID, settings, and context, then fetch chats
  useEffect(() => {
    async function init() {
      const response = await fetch(`/api/projects/${slug}`)
      if (response.ok) {
        const data = await response.json()
        setProject(data.project)
        setProjectId(data.project.id)
        await fetchChats(data.project.id)
        
        // Fetch project context for AI sessions
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

  // Auto-select first chat if none selected
  useEffect(() => {
    if (chats.length > 0 && !activeChat) {
      setActiveChat(chats[0])
    }
  }, [chats, activeChat, setActiveChat])

  const handleSendMessage = async (content: string, images?: string[]) => {
    if (!activeChat) return
    
    console.log("[Chat] handleSendMessage called, openClawConnected:", openClawConnected)
    
    // Check if this is the first message (session not yet established)
    const isFirstMessage = !activeChat.session_key
    
    // Store session key if this is the first message and we don't have one yet
    if (isFirstMessage) {
      try {
        await fetch(`/api/chats/${activeChat.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_key: sessionKey }),
        })
        // Update local state
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
    
    // Save user message to local DB
    await sendMessageToDb(activeChat.id, messageContent, "dan")
    
    // Build the message to send to OpenClaw
    // For first message, include project context to establish session scope
    let openClawMessage = messageContent
    if (isFirstMessage && projectContext) {
      openClawMessage = `[Project Context]\n\n${projectContext}\n\n---\n\n[User Message]\n\n${messageContent}`
      console.log("[Chat] Including project context for first message")
    }
    
    // Send to OpenClaw main session via WebSocket
    // Note: runId tracking is handled in onTypingStart to avoid race conditions
    if (openClawConnected) {
      try {
        console.log("[Chat] Calling sendToOpenClaw with chatId:", activeChat.id)
        const runId = await sendToOpenClaw(openClawMessage, activeChat.id)
        console.log("[Chat] sendToOpenClaw returned runId:", runId)
      } catch (error) {
        console.error("[Chat] Failed to send to OpenClaw:", error)
      }
    } else {
      console.warn("[Chat] OpenClaw not connected, skipping WebSocket send")
    }
  }

  const handleStopChat = async () => {
    if (!activeChat) return
    
    console.log("[Chat] Stopping chat response for chat:", activeChat.id)
    
    try {
      // Attempt to abort via OpenClaw
      if (openClawConnected) {
        console.log("[Chat] Aborting chat via WebSocket")
        await abortChat()
      } else {
        console.log("[Chat] OpenClaw not connected, cleaning up local state only")
      }
    } catch (error) {
      console.error("[Chat] Failed to abort chat:", error)
    } finally {
      // Always clean up local state, even if abort failed
      console.log("[Chat] Cleaning up local UI state")
      
      // Clear typing indicators for Ada
      setTyping(activeChat.id, "ada", false)
      
      // Clear streaming message if any
      clearStreamingMessage(activeChat.id)
      
      // Show user that response was cancelled
      await sendMessageToDb(
        activeChat.id,
        "_Response cancelled by user_",
        "system"
      )
    }
  }

  const handleCreateTask = (message: ChatMessage) => {
    setCreateTaskMessage(message)
  }

  const handleTaskCreated = async () => {
    // Optionally post a message linking to the task
    if (activeChat) {
      await sendMessageToDb(
        activeChat.id, 
        `📋 Created task from this conversation. Check the board for details.`,
        "dan"
      )
    }
  }

  const currentMessages = activeChat ? messages[activeChat.id] || [] : []

  return (
    <>
      <div className="flex h-[calc(100vh-140px)] bg-[var(--bg-primary)] rounded-lg border border-[var(--border)] overflow-hidden">
        {/* Sidebar - Desktop: always visible, Mobile: drawer */}
        {projectId && (
          <ChatSidebar 
            projectId={projectId}
            projectSlug={slug}
            isOpen={isMobile ? sidebarOpen : true}
            onClose={() => setSidebarOpen(false)}
            isMobile={isMobile}
          />
        )}
        
        {/* Main chat area */}
        <div className="flex-1 flex flex-col">
          {activeChat ? (
            <>
              {/* Chat header */}
              <div className="border-b border-[var(--border)]">
                <div className="flex items-center">
                  {/* Mobile menu button */}
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
                
                {/* Status bar */}
                <div className="px-4 py-2 border-t border-[var(--border)]/50 bg-[var(--bg-secondary)]/30">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-4">
                      {activeChat.participants && (
                        <span className="text-[var(--text-muted)]">
                          Participants: {JSON.parse(activeChat.participants as string).join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <StreamingToggle 
                        enabled={settings.streamingEnabled} 
                        onChange={toggleStreaming} 
                      />
                      <SessionInfoDropdown
                        sessionKey={sessionKey}
                        sessionInfo={sessionInfo || undefined}
                        connected={openClawConnected}
                        activeSubagents={activeSubagents}
                        activeCrons={activeCrons}
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Messages */}
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
              
              {/* Input */}
              <ChatInput 
                onSend={handleSendMessage}
                onStop={handleStopChat}
                isAssistantTyping={activeChat ? (typingIndicators[activeChat.id] || []).some(t => t.author === "ada") : false}
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
      
      {/* Create Task Modal */}
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
// Updated
