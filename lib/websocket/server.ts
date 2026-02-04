import { WebSocketServer, WebSocket as WS } from 'ws'
import type { Task, TaskStatus } from '@/lib/db/types'

export type WebSocketMessage = 
  | { type: 'task:created'; data: Task }
  | { type: 'task:updated'; data: Task }
  | { type: 'task:deleted'; data: { id: string; projectId: string } }
  | { type: 'task:moved'; data: { id: string; status: TaskStatus; projectId: string } }
  | { type: 'presence:join'; data: { userId: string; projectId: string } }
  | { type: 'presence:leave'; data: { userId: string; projectId: string } }

interface Client {
  ws: WS
  projectId?: string
  userId?: string
  lastSeen: number
}

class WebSocketManager {
  private wss: WebSocketServer | null = null
  private clients = new Map<string, Client>()
  private projectSubscriptions = new Map<string, Set<string>>() // projectId -> clientIds

  initialize(port: number = 3003) {
    if (this.wss) return // Already initialized

    this.wss = new WebSocketServer({ port })
    console.log(`WebSocket server started on port ${port}`)

    this.wss.on('connection', (ws) => {
      const clientId = this.generateClientId()
      const client: Client = {
        ws,
        lastSeen: Date.now()
      }
      
      this.clients.set(clientId, client)

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(clientId, message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      })

      ws.on('close', () => {
        this.handleDisconnect(clientId)
      })

      ws.on('error', (error) => {
        console.error('WebSocket error:', error)
        this.handleDisconnect(clientId)
      })

      // Send connection confirmation
      this.sendToClient(clientId, {
        type: 'connection:established',
        data: { clientId }
      })
    })

    // Cleanup disconnected clients every 30 seconds
    setInterval(() => {
      this.cleanupStaleClients()
    }, 30000)
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private handleMessage(clientId: string, message: { type: string; projectId?: string; userId?: string }) {
    const client = this.clients.get(clientId)
    if (!client) return

    client.lastSeen = Date.now()

    switch (message.type) {
      case 'subscribe':
        this.subscribeToProject(clientId, message.projectId, message.userId)
        break
      case 'unsubscribe':
        this.unsubscribeFromProject(clientId, message.projectId)
        break
      case 'ping':
        this.sendToClient(clientId, { type: 'pong', data: {} })
        break
    }
  }

  private subscribeToProject(clientId: string, projectId: string, userId?: string) {
    const client = this.clients.get(clientId)
    if (!client) return

    // Unsubscribe from previous project if any
    if (client.projectId) {
      this.unsubscribeFromProject(clientId, client.projectId)
    }

    client.projectId = projectId
    client.userId = userId

    if (!this.projectSubscriptions.has(projectId)) {
      this.projectSubscriptions.set(projectId, new Set())
    }
    this.projectSubscriptions.get(projectId)!.add(clientId)

    // Notify others in the project about new presence
    if (userId) {
      this.broadcastToProject(projectId, {
        type: 'presence:join',
        data: { userId, projectId }
      }, clientId)
    }

    console.log(`Client ${clientId} subscribed to project ${projectId}`)
  }

  private unsubscribeFromProject(clientId: string, projectId: string) {
    const client = this.clients.get(clientId)
    const subscribers = this.projectSubscriptions.get(projectId)
    
    if (subscribers) {
      subscribers.delete(clientId)
      if (subscribers.size === 0) {
        this.projectSubscriptions.delete(projectId)
      }
    }

    // Notify others about presence leave
    if (client?.userId) {
      this.broadcastToProject(projectId, {
        type: 'presence:leave',
        data: { userId: client.userId, projectId }
      }, clientId)
    }

    if (client) {
      client.projectId = undefined
      client.userId = undefined
    }

    console.log(`Client ${clientId} unsubscribed from project ${projectId}`)
  }

  private handleDisconnect(clientId: string) {
    const client = this.clients.get(clientId)
    
    if (client?.projectId) {
      this.unsubscribeFromProject(clientId, client.projectId)
    }
    
    this.clients.delete(clientId)
    console.log(`Client ${clientId} disconnected`)
  }

  private cleanupStaleClients() {
    const now = Date.now()
    const staleThreshold = 60000 // 1 minute

    for (const [clientId, client] of this.clients.entries()) {
      if (now - client.lastSeen > staleThreshold) {
        if (client.ws.readyState === WS.OPEN) {
          client.ws.close()
        }
        this.handleDisconnect(clientId)
      }
    }
  }

  private sendToClient(clientId: string, message: { type: string; data: Record<string, unknown> | { clientId: string } }) {
    const client = this.clients.get(clientId)
    if (!client || client.ws.readyState !== WS.OPEN) return

    try {
      client.ws.send(JSON.stringify(message))
    } catch (error) {
      console.error('Failed to send message to client:', error)
      this.handleDisconnect(clientId)
    }
  }

  broadcastToProject(projectId: string, message: WebSocketMessage, excludeClientId?: string) {
    const subscribers = this.projectSubscriptions.get(projectId)
    if (!subscribers) return

    const messageStr = JSON.stringify(message)
    
    for (const clientId of subscribers) {
      if (excludeClientId && clientId === excludeClientId) continue
      
      const client = this.clients.get(clientId)
      if (!client || client.ws.readyState !== WS.OPEN) {
        subscribers.delete(clientId)
        continue
      }

      try {
        client.ws.send(messageStr)
      } catch (error) {
        console.error('Failed to broadcast to client:', error)
        subscribers.delete(clientId)
      }
    }
  }

  getProjectSubscribers(projectId: string): string[] {
    const subscribers = this.projectSubscriptions.get(projectId)
    if (!subscribers) return []
    
    return Array.from(subscribers).map(clientId => {
      const client = this.clients.get(clientId)
      return client?.userId || 'anonymous'
    }).filter(userId => userId !== 'anonymous')
  }
}

// Singleton instance
export const wsManager = new WebSocketManager()

// WebSocket server initialization is handled by scripts/start-websocket-server.ts
// This prevents auto-initialization during Next.js builds and app startup