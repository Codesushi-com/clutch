import { create } from "zustand"
import type { Chat, ChatMessage } from "@/lib/types"

export type ChatWithLastMessage = Chat & {
  lastMessage?: {
    content: string
    author: string
    created_at: number
  } | null
}

interface StreamingMessage {
  runId: string
  author: string
  content: string
  timestamp: number
}

interface ChatState {
  chats: ChatWithLastMessage[]
  activeChat: ChatWithLastMessage | null
  messages: Record<string, ChatMessage[]>
  streamingMessages: Record<string, StreamingMessage> // chatId -> streaming message
  scrollPositions: Record<string, number> // chatId -> scroll position
  loading: boolean
  loadingMessages: boolean
  error: string | null
  currentProjectId: string | null
  typingIndicators: Record<string, { author: string; state: "thinking" | "typing" }[]> // chatId -> typing info
  
  // Actions
  fetchChats: (projectId: string) => Promise<void>
  createChat: (projectId: string, title?: string, participants?: string[]) => Promise<Chat>
  updateChat: (chatId: string, updates: Partial<Pick<Chat, "title">>) => Promise<Chat>
  setActiveChat: (chat: ChatWithLastMessage | null) => void
  deleteChat: (chatId: string) => Promise<void>
  
  fetchMessages: (chatId: string) => Promise<void>
  refreshMessages: (chatId: string) => Promise<void> // Same as fetchMessages but without loading state
  sendMessage: (chatId: string, content: string, author?: string) => Promise<ChatMessage>
  loadMoreMessages: (chatId: string) => Promise<boolean>
  
  // SSE event handlers
  receiveMessage: (chatId: string, message: ChatMessage) => void
  setTyping: (chatId: string, author: string, state: "thinking" | "typing" | false) => void
  
  // Streaming handlers
  startStreamingMessage: (chatId: string, runId: string, author: string) => void
  appendToStreamingMessage: (chatId: string, delta: string) => void
  finalizeStreamingMessage: (chatId: string, finalMessage?: ChatMessage) => void
  clearStreamingMessage: (chatId: string) => void
  
  // Convex sync
  syncMessages: (chatId: string, messages: ChatMessage[]) => void
  syncChats: (chats: ChatWithLastMessage[]) => void
  syncTyping: (chatId: string, typingState: { author: string; state: "thinking" | "typing" }[]) => void

  // Scroll position tracking
  setScrollPosition: (chatId: string, position: number) => void
  getScrollPosition: (chatId: string) => number
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChat: null,
  messages: {},
  streamingMessages: {},
  scrollPositions: {},
  loading: false,
  loadingMessages: false,
  error: null,
  currentProjectId: null,
  typingIndicators: {},

  fetchChats: async (projectId) => {
    set({ loading: true, error: null, currentProjectId: projectId })
    
    const response = await fetch(`/api/chats?projectId=${projectId}`)
    
    if (!response.ok) {
      const data = await response.json()
      set({ loading: false, error: data.error || "Failed to fetch chats" })
      throw new Error(data.error || "Failed to fetch chats")
    }
    
    const data = await response.json()
    set({ chats: data.chats, loading: false })
  },

  createChat: async (projectId, title, participants = ["ada"]) => {
    const response = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, title, participants }),
    })
    
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to create chat")
    }
    
    const data = await response.json()
    
    set((state) => ({
      chats: [{ ...data.chat, lastMessage: null }, ...state.chats],
    }))
    
    return data.chat
  },

  updateChat: async (chatId, updates) => {
    const response = await fetch("/api/chats", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: chatId, ...updates }),
    })
    
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to update chat")
    }
    
    const data = await response.json()
    
    set((state) => ({
      chats: state.chats.map((c) => 
        c.id === chatId ? { ...c, ...updates } : c
      ),
      activeChat: state.activeChat?.id === chatId 
        ? { ...state.activeChat, ...updates }
        : state.activeChat,
    }))
    
    return data.chat
  },

  setActiveChat: (chat) => {
    set({ activeChat: chat })
    if (chat) {
      get().fetchMessages(chat.id)
    }
  },

  deleteChat: async (chatId) => {
    const response = await fetch(`/api/chats/${chatId}`, {
      method: "DELETE",
    })
    
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to delete chat")
    }
    
    set((state) => ({
      chats: state.chats.filter((c) => c.id !== chatId),
      activeChat: state.activeChat?.id === chatId ? null : state.activeChat,
      messages: { ...state.messages, [chatId]: undefined } as Record<string, ChatMessage[]>,
    }))
  },

  fetchMessages: async (chatId) => {
    set({ loadingMessages: true })
    
    const response = await fetch(`/api/chats/${chatId}/messages`)
    
    if (!response.ok) {
      set({ loadingMessages: false })
      return
    }
    
    const data = await response.json()
    
    set((state) => ({
      messages: { ...state.messages, [chatId]: data.messages },
      loadingMessages: false,
    }))
  },

  refreshMessages: async (chatId) => {
    // Same as fetchMessages but without loading state for seamless refresh
    const response = await fetch(`/api/chats/${chatId}/messages`)
    
    if (!response.ok) {
      return
    }
    
    const data = await response.json()
    
    set((state) => ({
      messages: { ...state.messages, [chatId]: data.messages },
    }))
  },

  sendMessage: async (chatId, content, author = "dan") => {
    const response = await fetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, author }),
    })
    
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to send message")
    }
    
    const data = await response.json()
    
    set((state) => {
      const existing = state.messages[chatId] || []
      
      // Check if message already exists (SSE might have added it first)
      if (existing.some((m) => m.id === data.message.id)) {
        return state
      }
      
      return {
        messages: {
          ...state.messages,
          [chatId]: [...existing, data.message],
        },
        // Update lastMessage on the chat
        chats: state.chats.map((c) =>
          c.id === chatId
            ? {
                ...c,
                lastMessage: {
                  content: data.message.content,
                  author: data.message.author,
                  created_at: data.message.created_at,
                },
                updated_at: data.message.created_at,
              }
            : c
        ),
      }
    })
    
    return data.message
  },

  loadMoreMessages: async (chatId) => {
    const currentMessages = get().messages[chatId] || []
    if (currentMessages.length === 0) return false
    
    const oldestMessage = currentMessages[0]
    
    const response = await fetch(
      `/api/chats/${chatId}/messages?before=${oldestMessage.id}&limit=50`
    )
    
    if (!response.ok) return false
    
    const data = await response.json()
    
    if (data.messages.length === 0) return false
    
    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: [...data.messages, ...(state.messages[chatId] || [])],
      },
    }))
    
    return data.hasMore
  },

  // Receive a message from SSE (avoid duplicates)
  receiveMessage: (chatId, message) => {
    set((state) => {
      const existing = state.messages[chatId] || []
      
      // Check if message already exists (by id)
      if (existing.some((m) => m.id === message.id)) {
        return state
      }
      
      return {
        messages: {
          ...state.messages,
          [chatId]: [...existing, message],
        },
        // Update lastMessage on the chat
        chats: state.chats.map((c) =>
          c.id === chatId
            ? {
                ...c,
                lastMessage: {
                  content: message.content,
                  author: message.author,
                  created_at: message.created_at,
                },
                updated_at: message.created_at,
              }
            : c
        ),
        // Clear typing indicator for this author
        typingIndicators: {
          ...state.typingIndicators,
          [chatId]: (state.typingIndicators[chatId] || []).filter((t) => t.author !== message.author),
        },
      }
    })
  },

  // Handle typing indicator from SSE
  setTyping: (chatId, author, state) => {
    set((store) => {
      const current = store.typingIndicators[chatId] || []
      const existing = current.find((t) => t.author === author)
      
      if (state && !existing) {
        // Add new typing indicator
        return {
          typingIndicators: {
            ...store.typingIndicators,
            [chatId]: [...current, { author, state }],
          },
        }
      } else if (state && existing && existing.state !== state) {
        // Update state (thinking -> typing)
        return {
          typingIndicators: {
            ...store.typingIndicators,
            [chatId]: current.map((t) => t.author === author ? { author, state } : t),
          },
        }
      } else if (!state && existing) {
        // Remove typing indicator
        return {
          typingIndicators: {
            ...store.typingIndicators,
            [chatId]: current.filter((t) => t.author !== author),
          },
        }
      }
      
      return store
    })
  },

  // Start a new streaming message
  startStreamingMessage: (chatId, runId, author) => {
    set((state) => ({
      streamingMessages: {
        ...state.streamingMessages,
        [chatId]: {
          runId,
          author,
          content: "",
          timestamp: Date.now(),
        },
      },
    }))
  },

  // Append delta text to streaming message
  appendToStreamingMessage: (chatId, delta) => {
    set((state) => {
      const current = state.streamingMessages[chatId]
      if (!current) return state

      return {
        streamingMessages: {
          ...state.streamingMessages,
          [chatId]: {
            ...current,
            content: current.content + delta,
          },
        },
      }
    })
  },

  // Finalize streaming message (replace with final message or convert)
  finalizeStreamingMessage: (chatId, finalMessage) => {
    set((state) => {
      const streaming = state.streamingMessages[chatId]
      if (!streaming) return state

      const newState = {
        streamingMessages: { ...state.streamingMessages },
      }
      delete newState.streamingMessages[chatId]

      // If we have a final message from the server, use that
      // Otherwise, convert the streaming message to a regular message
      if (finalMessage) {
        const existing = state.messages[chatId] || []
        if (!existing.some((m) => m.id === finalMessage.id)) {
          return {
            ...newState,
            messages: {
              ...state.messages,
              [chatId]: [...existing, finalMessage],
            },
          }
        }
      }

      return newState
    })
  },

  // Clear streaming message without finalizing
  clearStreamingMessage: (chatId) => {
    set((state) => {
      const newStreamingMessages = { ...state.streamingMessages }
      delete newStreamingMessages[chatId]
      
      return {
        streamingMessages: newStreamingMessages,
      }
    })
  },

  // Sync messages from Convex reactive query (replaces fetch-based loading)
  syncMessages: (chatId, messages) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: messages,
      },
      loadingMessages: false,
    }))
  },

  // Sync chat list from Convex reactive query
  syncChats: (chats) => {
    set((state) => {
      // Preserve activeChat reference if it still exists
      const activeChat = state.activeChat
        ? chats.find((c) => c.id === state.activeChat?.id) ?? state.activeChat
        : state.activeChat

      return {
        chats,
        activeChat,
        loading: false,
      }
    })
  },

  // Sync typing state from Convex reactive query
  syncTyping: (chatId, typingState) => {
    set((state) => ({
      typingIndicators: {
        ...state.typingIndicators,
        [chatId]: typingState,
      },
    }))
  },

  // Store scroll position for a chat
  setScrollPosition: (chatId, position) => {
    set((state) => ({
      scrollPositions: {
        ...state.scrollPositions,
        [chatId]: position,
      },
    }))
  },

  // Get scroll position for a chat (returns 0 if not set)
  getScrollPosition: (chatId) => {
    return get().scrollPositions[chatId] || 0
  },
}))
