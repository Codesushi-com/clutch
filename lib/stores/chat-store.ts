import { create } from "zustand"
import type { Chat, ChatMessage } from "@/lib/db/types"

export type ChatWithLastMessage = Chat & {
  lastMessage?: {
    content: string
    author: string
    created_at: number
  } | null
}

interface ChatState {
  chats: ChatWithLastMessage[]
  activeChat: ChatWithLastMessage | null
  messages: Record<string, ChatMessage[]>
  loading: boolean
  loadingMessages: boolean
  error: string | null
  currentProjectId: string | null
  typingAuthors: Record<string, string[]> // chatId -> authors currently typing
  
  // Actions
  fetchChats: (projectId: string) => Promise<void>
  createChat: (projectId: string, title: string, participants?: string[]) => Promise<Chat>
  setActiveChat: (chat: ChatWithLastMessage | null) => void
  deleteChat: (chatId: string) => Promise<void>
  
  fetchMessages: (chatId: string) => Promise<void>
  sendMessage: (chatId: string, content: string, author?: string) => Promise<ChatMessage>
  loadMoreMessages: (chatId: string) => Promise<boolean>
  
  // SSE event handlers
  receiveMessage: (chatId: string, message: ChatMessage) => void
  setTyping: (chatId: string, author: string, typing: boolean) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChat: null,
  messages: {},
  loading: false,
  loadingMessages: false,
  error: null,
  currentProjectId: null,
  typingAuthors: {},

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
        typingAuthors: {
          ...state.typingAuthors,
          [chatId]: (state.typingAuthors[chatId] || []).filter((a) => a !== message.author),
        },
      }
    })
  },

  // Handle typing indicator from SSE
  setTyping: (chatId, author, typing) => {
    set((state) => {
      const current = state.typingAuthors[chatId] || []
      
      if (typing && !current.includes(author)) {
        return {
          typingAuthors: {
            ...state.typingAuthors,
            [chatId]: [...current, author],
          },
        }
      } else if (!typing && current.includes(author)) {
        return {
          typingAuthors: {
            ...state.typingAuthors,
            [chatId]: current.filter((a) => a !== author),
          },
        }
      }
      
      return state
    })
  },
}))
