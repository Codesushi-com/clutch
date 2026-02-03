"use client"

import { useEffect, useState, use } from "react"
import { MessageSquare } from "lucide-react"
import { useChatStore } from "@/lib/stores/chat-store"
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
    fetchChats, 
    sendMessage,
    setActiveChat,
  } = useChatStore()

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
    await sendMessage(activeChat.id, content)
  }

  const handleCreateTask = (message: ChatMessage) => {
    setCreateTaskMessage(message)
  }

  const handleTaskCreated = async (taskId: string) => {
    // Optionally post a message linking to the task
    if (activeChat) {
      await sendMessage(
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
              <div className="px-4 py-3 border-b border-[var(--border)]">
                <h2 className="font-medium text-[var(--text-primary)]">
                  {activeChat.title}
                </h2>
                {activeChat.participants && (
                  <p className="text-xs text-[var(--text-muted)]">
                    {JSON.parse(activeChat.participants as string).join(", ")}
                  </p>
                )}
              </div>
              
              {/* Messages */}
              <ChatThread 
                messages={currentMessages} 
                loading={loadingMessages}
                onCreateTask={handleCreateTask}
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
