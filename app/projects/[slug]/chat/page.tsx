"use client"

import { useEffect, useState, use, useCallback } from "react"
import { MessageSquare, Wifi, WifiOff, Bot } from "lucide-react"
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
import type { ChatMessage } from "@/lib/db/types"

type PageProps = {
  params: Promise<{ slug: string }>
}

export default function ChatPage({ params }: PageProps) {
  const { slug } = use(params)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [createTaskMessage, setCreateTaskMessage] = useState<ChatMessage | null>(null)
  
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
    receiveMessage,
    setTyping,
    startStreamingMessage,
    appendToStreamingMessage,
    finalizeStreamingMessage,
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
    
    // Dedupe with race-condition guard: check, wait, re-check
    const lockKey = `openclaw-msg-${runId}`
    if (localStorage.getItem(lockKey)) {
      console.log("[Chat] Skipping duplicate save for runId:", runId)
      return
    }
    
    // Claim the lock
    const myToken = Math.random().toString(36)
    localStorage.setItem(lockKey, myToken)
    
    // Wait a bit for other tabs to also try claiming
    await new Promise(r => setTimeout(r, 50))
    
    // Re-check: only proceed if we still hold the lock
    if (localStorage.getItem(lockKey) !== myToken) {
      console.log("[Chat] Lost lock race for runId:", runId)
      return
    }
    
    // Mark as saved (keep for 60s)
    localStorage.setItem(lockKey, "saved")
    setTimeout(() => localStorage.removeItem(lockKey), 60000)
    
    // Extract text from content
    const text = typeof msg.content === "string" 
      ? msg.content 
      : msg.content.find(c => c.type === "text")?.text || ""
    
    // Save Ada's response to local DB
    console.log("[Chat] Saving message to Trap DB for chat:", activeChat.id)
    fetch(`/api/chats/${activeChat.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, author: "ada" }),
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

  // Generate session key based on active chat
  const sessionKey = activeChat ? `trap:${activeChat.id}` : "main"

  const { connected: openClawConnected, sending: openClawSending, sendMessage: sendToOpenClaw, abortChat } = useOpenClawChat({
    sessionKey,
    onMessage: handleOpenClawMessage,
    onDelta: handleOpenClawDelta,
    onTypingStart: handleOpenClawTypingStart,
    onTypingEnd: handleOpenClawTypingEnd,
  })

  // Sub-agent monitoring via RPC
  const { connected: rpcConnected, listSessions } = useOpenClawRpc()
  const [activeSubagents, setActiveSubagents] = useState<Array<{ key: string; label?: string; model?: string }>>([])

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
          .map((s) => ({
            key: s.key as string,
            label: s.label as string | undefined,
            model: s.model as string | undefined,
          }))
        setActiveSubagents(subagents)
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

  useChatEvents({
    chatId: activeChat?.id || "",
    onMessage: handleNewMessage,
    onTyping: handleTyping,
    enabled: Boolean(activeChat),
  })

  // Fetch project to get ID, then fetch chats
  useEffect(() => {
    async function init() {
      const response = await fetch(`/api/projects/${slug}`)
      if (response.ok) {
        const data = await response.json()
        setProjectId(data.project.id)
        await fetchChats(data.project.id)
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

  const handleSendMessage = async (content: string) => {
    if (!activeChat) return
    
    console.log("[Chat] handleSendMessage called, openClawConnected:", openClawConnected)
    
    // Store session key if this is the first message and we don't have one yet
    if (!activeChat.session_key) {
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
    
    // Save user message to local DB
    await sendMessageToDb(activeChat.id, content, "dan")
    
    // Send to OpenClaw main session via WebSocket
    // Note: runId tracking is handled in onTypingStart to avoid race conditions
    if (openClawConnected) {
      try {
        console.log("[Chat] Calling sendToOpenClaw with chatId:", activeChat.id)
        const runId = await sendToOpenClaw(content, activeChat.id)
        console.log("[Chat] sendToOpenClaw returned runId:", runId)
      } catch (error) {
        console.error("[Chat] Failed to send to OpenClaw:", error)
      }
    } else {
      console.warn("[Chat] OpenClaw not connected, skipping WebSocket send")
    }
  }

  const handleStopChat = async () => {
    if (!openClawConnected) return
    
    try {
      console.log("[Chat] Aborting chat response")
      await abortChat()
    } catch (error) {
      console.error("[Chat] Failed to abort chat:", error)
    }
  }

  const handleCreateTask = (message: ChatMessage) => {
    setCreateTaskMessage(message)
  }

  const handleTaskCreated = async (taskId: string) => {
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
        {/* Sidebar */}
        {projectId && <ChatSidebar projectId={projectId} />}
        
        {/* Main chat area */}
        <div className="flex-1 flex flex-col">
          {activeChat ? (
            <>
              {/* Chat header */}
              <div className="border-b border-[var(--border)]">
                <ChatHeader chat={activeChat} />
                
                {/* Status bar */}
                <div className="px-4 py-2 border-t border-[var(--border)]/50 bg-[var(--bg-secondary)]/30">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-4">
                      {activeChat.participants && (
                        <span className="text-[var(--text-muted)]">
                          Participants: {JSON.parse(activeChat.participants as string).join(", ")}
                        </span>
                      )}
                      <span className="text-[var(--text-muted)]">
                        Session: <span className="font-mono text-blue-400">{sessionKey}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <StreamingToggle 
                        enabled={settings.streamingEnabled} 
                        onChange={toggleStreaming} 
                      />
                      {activeSubagents.length > 0 && (
                        <span 
                          className="flex items-center gap-1 text-purple-400 cursor-help"
                          title={activeSubagents.map(s => s.label || s.key).join(", ")}
                        >
                          <Bot className="h-3 w-3 animate-pulse" />
                          {activeSubagents.length} sub-agent{activeSubagents.length > 1 ? "s" : ""}
                        </span>
                      )}
                      {openClawConnected ? (
                        <span className="flex items-center gap-1 text-green-500">
                          <Wifi className="h-3 w-3" />
                          Connected
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-yellow-500">
                          <WifiOff className="h-3 w-3" />
                          Connecting...
                        </span>
                      )}
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
