"use client"

import { useEffect, useState, use, useCallback, useRef } from "react"
import { MessageSquare, Wifi, WifiOff, Bot } from "lucide-react"
import { useChatStore } from "@/lib/stores/chat-store"
import { useChatEvents } from "@/lib/hooks/use-chat-events"
import { useOpenClawChat } from "@/lib/hooks/use-openclaw-chat"
import { useOpenClawRpc } from "@/lib/hooks/use-openclaw-rpc"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { ChatThread } from "@/components/chat/chat-thread"
import { ChatInput } from "@/components/chat/chat-input"
import { CreateTaskFromMessage } from "@/components/chat/create-task-from-message"
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
    loadingMessages,
    typingIndicators,
    fetchChats, 
    sendMessage: sendMessageToDb,
    setActiveChat,
    receiveMessage,
    setTyping,
  } = useChatStore()

  // OpenClaw WebSocket connection for main session
  const handleOpenClawMessage = useCallback(async (msg: { role: string; content: string | Array<{ type: string; text?: string }> }, runId: string) => {
    console.log("[Chat] onMessage (WebSocket) received, runId:", runId)
    if (!activeChat) {
      console.log("[Chat] No activeChat, ignoring message")
      return
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
  }, [activeChat])

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

  const handleOpenClawDelta = useCallback(() => {
    if (activeChat) {
      // Switch from "thinking" to "typing" on first delta
      setTyping(activeChat.id, "ada", "typing")
    }
  }, [activeChat, setTyping])

  const { connected: openClawConnected, sending: openClawSending, sendMessage: sendToOpenClaw } = useOpenClawChat({
    sessionKey: "main",
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
        const response = await listSessions({ limit: 50 })
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
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <div>
                  <h2 className="font-medium text-[var(--text-primary)]">
                    {activeChat.title}
                  </h2>
                  {activeChat.participants && (
                    <p className="text-xs text-[var(--text-muted)]">
                      {JSON.parse(activeChat.participants as string).join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs">
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
              
              {/* Messages */}
              <ChatThread 
                messages={currentMessages} 
                loading={loadingMessages}
                onCreateTask={handleCreateTask}
                typingIndicators={typingIndicators[activeChat.id] || []}
              />
              
              {/* Input */}
              <ChatInput onSend={handleSendMessage} />
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
