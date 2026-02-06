"use client"

import { useEffect, useState, use, useCallback } from "react"
import { MessageSquare, Menu } from "lucide-react"
import { useChatStore } from "@/lib/stores/chat-store"
import { useOpenClawWS } from "@/lib/providers/openclaw-ws-provider"
import { useOpenClawRpc } from "@/lib/hooks/use-openclaw-rpc"
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
    startStreamingMessage,
    appendToStreamingMessage,
    clearStreamingMessage,
  } = useChatStore()

  // Settings for streaming toggle
  const { settings, toggleStreaming } = useSettings()

  // Generate session key based on project and active chat
  // Format: trap:{projectSlug}:{chatId} - includes project for context
  const sessionKey = activeChat ? `trap:${slug}:${activeChat.id}` : "main"

  // ==========================================================================
  // OpenClaw Integration
  // - HTTP POST for sending messages (reliable, works during gateway restarts)
  // - WebSocket for typing indicators & streaming (best-effort, visual only)
  // - Message persistence handled server-side by trap-channel plugin
  // - Convex reactive queries update the UI automatically
  // ==========================================================================

  const handleOpenClawTyping = useCallback((isTyping: boolean, state?: "thinking" | "typing") => {
    if (!activeChat) return
    
    if (isTyping && state) {
      setTyping(activeChat.id, "ada", state)
    } else {
      setTyping(activeChat.id, "ada", false)
    }
  }, [activeChat, setTyping])

  const handleOpenClawDelta = useCallback((delta: string, runId: string) => {
    if (!activeChat) return
    
    setTyping(activeChat.id, "ada", "typing")
    
    if (settings.streamingEnabled) {
      if (!streamingMessages[activeChat.id] || streamingMessages[activeChat.id].runId !== runId) {
        startStreamingMessage(activeChat.id, runId, "ada")
      }
      appendToStreamingMessage(activeChat.id, delta)
    }
  }, [activeChat, setTyping, settings.streamingEnabled, streamingMessages, startStreamingMessage, appendToStreamingMessage])

  const handleOpenClawMessageComplete = useCallback((_msg: unknown, runId: string) => {
    if (!activeChat) return
    
    // Clear streaming state — the actual message is persisted by the
    // trap-channel plugin (agent_end hook → Convex), not by the frontend.
    if (settings.streamingEnabled && streamingMessages[activeChat.id]?.runId === runId) {
      clearStreamingMessage(activeChat.id)
    }
    setTyping(activeChat.id, "ada", false)
  }, [activeChat, settings.streamingEnabled, streamingMessages, clearStreamingMessage, setTyping])

  const { status, sendChatMessage, subscribe, rpc } = useOpenClawWS()
  const openClawConnected = status === 'connected'

  // Subscribe to OpenClaw WebSocket events
  useEffect(() => {
    const unsubscribers = [
      subscribe('chat.typing.start', (data: unknown) => {
        const typedData = data as { runId: string; sessionKey?: string }
        if (!typedData.sessionKey || typedData.sessionKey === sessionKey) {
          handleOpenClawTyping(true, "thinking")
        }
      }),
      
      subscribe('chat.typing.end', (data: unknown) => {
        const typedData = data as { sessionKey?: string } | undefined
        if (!typedData?.sessionKey || typedData.sessionKey === sessionKey) {
          handleOpenClawTyping(false)
        }
      }),
      
      subscribe('chat.delta', (data: unknown) => {
        const { delta, runId, sessionKey: eventSessionKey } = data as { delta: string; runId: string; sessionKey?: string }
        if (!eventSessionKey || eventSessionKey === sessionKey) {
          handleOpenClawDelta(delta, runId)
        }
      }),
      
      subscribe('chat.message', (data: unknown) => {
        const { message, runId, sessionKey: eventSessionKey } = data as { message: unknown; runId: string; sessionKey?: string }
        if (!eventSessionKey || eventSessionKey === sessionKey) {
          handleOpenClawMessageComplete(message, runId)
        }
      }),
      
      subscribe('chat.error', (data: unknown) => {
        const { error, sessionKey: eventSessionKey } = data as { error: string; runId: string; sessionKey?: string }
        if (!eventSessionKey || eventSessionKey === sessionKey) {
          console.error('[Chat] OpenClaw chat error:', error)
          handleOpenClawTyping(false)
        }
      })
    ]

    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [subscribe, sessionKey, handleOpenClawMessageComplete, handleOpenClawDelta, handleOpenClawTyping])

  // ==========================================================================
  // Sub-agent & session monitoring via RPC
  // ==========================================================================

  const { connected: rpcConnected, listSessions, getGatewayStatus } = useOpenClawRpc()
  
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
  const [gatewayStatus, setGatewayStatus] = useState<{ 
    startedAt?: string; 
    uptime?: number; 
    version?: string; 
    uptimeString?: string;
  } | null>(null)

  // Fetch session info directly from sessions.list RPC
  useEffect(() => {
    async function fetchSessionInfo() {
      if (!activeChat?.session_key || !rpcConnected) {
        setSessionInfo(null)
        return
      }

      try {
        const response = await rpc<{ sessions: Array<Record<string, unknown>> }>("sessions.list", { limit: 200 })
        const sessions = response.sessions || []
        // OpenClaw RPC returns keys with "agent:main:" prefix, chat stores without it
        const session = sessions.find(s => s.key === activeChat.session_key)
          || sessions.find(s => String(s.key || '').endsWith(activeChat.session_key!))
        if (session) {
          const totalTokens = (session.totalTokens as number) || 0
          const contextWindow = (session.contextTokens as number) || 200000
          const contextPercent = contextWindow > 0 ? Math.round((totalTokens / contextWindow) * 100) : 0
          setSessionInfo({
            model: session.model as string,
            contextPercent,
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
    // Refresh every 30s while connected
    const interval = setInterval(fetchSessionInfo, 30000)
    return () => clearInterval(interval)
  }, [activeChat?.session_key, rpcConnected, rpc])

  // Fetch gateway status and format uptime
  useEffect(() => {
    if (!rpcConnected) return
    
    const fetchGatewayStatus = async () => {
      try {
        const status = await getGatewayStatus()
        if (status) {
          let uptimeString: string | undefined
          
          if (status.uptime && status.uptime > 0) {
            const uptimeMs = status.uptime
            const minutes = Math.floor(uptimeMs / 60000)
            const hours = Math.floor(minutes / 60)
            const days = Math.floor(hours / 24)
            
            if (days > 0) {
              uptimeString = `up ${days}d ${hours % 24}h`
            } else if (hours > 0) {
              uptimeString = `up ${hours}h ${minutes % 60}m`
            } else if (minutes > 0) {
              uptimeString = `up ${minutes}m`
            } else {
              uptimeString = "up <1m"
            }
          } else if (status.startedAt) {
            const startTime = new Date(status.startedAt).getTime()
            const now = Date.now()
            const uptimeMs = now - startTime
            const minutes = Math.floor(uptimeMs / 60000)
            const hours = Math.floor(minutes / 60)
            const days = Math.floor(hours / 24)
            
            if (days > 0) {
              uptimeString = `restarted ${days}d ago`
            } else if (hours > 0) {
              uptimeString = `restarted ${hours}h ago`
            } else if (minutes > 0) {
              uptimeString = `restarted ${minutes}m ago`
            } else {
              uptimeString = "restarted <1m ago"
            }
          }
          
          setGatewayStatus({ ...status, uptimeString })
        }
      } catch (error) {
        console.error('[Chat] Failed to fetch gateway status:', error)
      }
    }
    
    fetchGatewayStatus()
    const statusInterval = setInterval(fetchGatewayStatus, 30000)
    return () => clearInterval(statusInterval)
  }, [rpcConnected, getGatewayStatus])

  // Poll for active sub-agents and cron sessions
  useEffect(() => {
    if (!rpcConnected) return
    
    const pollSubagents = async () => {
      try {
        const response = await listSessions({ limit: 50 })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sessions = response.sessions as any[]
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
        
        const subagents = (sessions || [])
          .filter((s) => 
            s.spawnedBy === "agent:main:main" && 
            s.updatedAt && s.updatedAt > fiveMinutesAgo &&
            !s.key?.includes(":cron:")
          )
          .map((s) => {
            let runtime: string | undefined
            if (s.createdAt) {
              const runtimeMs = Date.now() - s.createdAt
              const minutes = Math.floor(runtimeMs / 60000)
              const seconds = Math.floor((runtimeMs % 60000) / 1000)
              runtime = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
            }
            return {
              key: s.key as string, label: s.label as string | undefined,
              model: s.model as string | undefined, status: s.status as string | undefined,
              agentId: s.agentId as string | undefined, createdAt: s.createdAt as number | undefined,
              updatedAt: s.updatedAt as number | undefined, runtime, isCron: false,
            }
          })

        const crons = (sessions || [])
          .filter((s) => s.updatedAt && s.updatedAt > fiveMinutesAgo && s.key?.includes(":cron:"))
          .map((s) => {
            let runtime: string | undefined
            if (s.createdAt) {
              const runtimeMs = Date.now() - s.createdAt
              const minutes = Math.floor(runtimeMs / 60000)
              const seconds = Math.floor((runtimeMs % 60000) / 1000)
              runtime = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
            }
            let cronLabel = s.label
            if (!cronLabel && s.key) {
              const trapTaskMatch = s.key.match(/:trap-(.+)$/)
              if (trapTaskMatch) cronLabel = `Trap: ${trapTaskMatch[1]}`
              else {
                const cronIdMatch = s.key.match(/:cron:([^:]+)/)
                cronLabel = cronIdMatch ? `Cron Job ${cronIdMatch[1].substring(0, 8)}...` : "Cron Job"
              }
            }
            return {
              key: s.key as string, label: cronLabel as string | undefined,
              model: s.model as string | undefined, status: s.status as string | undefined,
              agentId: s.agentId as string | undefined, createdAt: s.createdAt as number | undefined,
              updatedAt: s.updatedAt as number | undefined, runtime, isCron: true,
            }
          })

        setActiveSubagents(subagents)
        setActiveCrons(crons)
      } catch (err) {
        console.error("[Chat] Failed to poll subagents:", err)
      }
    }
    
    pollSubagents()
    const interval = setInterval(pollSubagents, 10000)
    return () => clearInterval(interval)
  }, [rpcConnected, listSessions])

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

    // Build message for OpenClaw (include project context on first message)
    let openClawMessage = messageContent
    if (isFirstMessage && projectContext) {
      openClawMessage = `[Project Context]\n\n${projectContext}\n\n---\n\n[User Message]\n\n${messageContent}`
    }

    // Send to OpenClaw via HTTP POST (not WebSocket)
    // This ensures reliable delivery even during gateway restarts
    // Response persistence is handled by the trap-channel plugin (agent_end hook)
    try {
      await sendChatMessage(openClawMessage, sessionKey, activeChat.id)
    } catch (error) {
      console.error("[Chat] Failed to send to OpenClaw:", error)
    }
  }

  const handleStopChat = async () => {
    if (!activeChat) return
    
    try {
      if (openClawConnected) {
        await rpc("chat.abort", { sessionKey })
      }
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
                        connected={openClawConnected}
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
