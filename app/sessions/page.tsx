"use client"

import * as React from "react"
import SessionFiltersComponent, { SessionFilters } from "@/components/sessions/session-filters"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, Clock, Cpu, MessageSquare, PlayCircle, StopCircle, Trash2 } from "lucide-react"

// Mock session data for development
interface Session {
  id: string
  name: string
  model: string
  status: "running" | "completed" | "failed" | "cancelled"
  createdAt: Date
  updatedAt: Date
  tokenCount: number
  cost: number
  messages: number
}

const MOCK_SESSIONS: Session[] = [
  {
    id: "session-1",
    name: "Main Chat Session",
    model: "opus",
    status: "running",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    updatedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
    tokenCount: 15420,
    cost: 0.85,
    messages: 24
  },
  {
    id: "session-2",
    name: "Axiom Trader Analysis",
    model: "sonnet",
    status: "completed",
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
    updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
    tokenCount: 8943,
    cost: 0.32,
    messages: 12
  },
  {
    id: "session-3",
    name: "Code Review Sub-agent",
    model: "haiku",
    status: "failed",
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
    updatedAt: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
    tokenCount: 3240,
    cost: 0.12,
    messages: 8
  },
  {
    id: "session-4",
    name: "Research Task",
    model: "gpt-4",
    status: "running",
    createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
    updatedAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
    tokenCount: 5670,
    cost: 0.67,
    messages: 6
  },
]

function getStatusColor(status: Session["status"]) {
  switch (status) {
    case "running":
      return "text-green-600 bg-green-50"
    case "completed":
      return "text-blue-600 bg-blue-50"
    case "failed":
      return "text-red-600 bg-red-50"
    case "cancelled":
      return "text-gray-600 bg-gray-50"
    default:
      return "text-gray-600 bg-gray-50"
  }
}

function getStatusIcon(status: Session["status"]) {
  switch (status) {
    case "running":
      return <PlayCircle className="h-4 w-4" />
    case "completed":
      return <StopCircle className="h-4 w-4" />
    case "failed":
      return <Trash2 className="h-4 w-4" />
    case "cancelled":
      return <StopCircle className="h-4 w-4" />
    default:
      return <Activity className="h-4 w-4" />
  }
}

function filterSessions(sessions: Session[], filters: SessionFilters): Session[] {
  return sessions.filter((session) => {
    // Model filter
    if (filters.models.length > 0 && !filters.models.includes(session.model)) {
      return false
    }

    // Status filter
    if (filters.statuses.length > 0 && !filters.statuses.includes(session.status)) {
      return false
    }

    // Time range filter
    if (filters.timeRange) {
      const now = new Date()
      const sessionDate = session.createdAt
      
      switch (filters.timeRange) {
        case "1h":
          if (now.getTime() - sessionDate.getTime() > 60 * 60 * 1000) return false
          break
        case "today":
          if (sessionDate.toDateString() !== now.toDateString()) return false
          break
        case "week":
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          if (sessionDate < weekAgo) return false
          break
        case "month":
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          if (sessionDate < monthAgo) return false
          break
      }
    }

    return true
  })
}

export default function SessionsPage() {
  const [filters, setFilters] = React.useState<SessionFilters>({
    models: [],
    statuses: [],
    timeRange: null
  })

  const filteredSessions = filterSessions(MOCK_SESSIONS, filters)

  const handleFiltersChange = (newFilters: SessionFilters) => {
    setFilters(newFilters)
  }

  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return "Just now"
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    
    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) return `${diffInHours}h ago`
    
    const diffInDays = Math.floor(diffInHours / 24)
    return `${diffInDays}d ago`
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sessions</h1>
          <p className="text-muted-foreground">
            Monitor and control all OpenClaw agent sessions
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="secondary">
            {filteredSessions.length} of {MOCK_SESSIONS.length} sessions
          </Badge>
        </div>
      </div>

      {/* Session Filters */}
      <SessionFiltersComponent onFiltersChange={handleFiltersChange} />

      {/* Sessions List */}
      <div className="space-y-4">
        {filteredSessions.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center space-y-2">
                <Activity className="h-12 w-12 mx-auto text-muted-foreground" />
                <h3 className="text-lg font-medium">No sessions found</h3>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your filters or create a new session
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredSessions.map((session) => (
            <Card key={session.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{session.name}</CardTitle>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="flex items-center space-x-1">
                      <Cpu className="h-3 w-3" />
                      <span className="capitalize">{session.model}</span>
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`flex items-center space-x-1 ${getStatusColor(session.status)}`}
                    >
                      {getStatusIcon(session.status)}
                      <span className="capitalize">{session.status}</span>
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center space-x-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{session.messages} messages</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{session.tokenCount.toLocaleString()} tokens</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm">💰 ${session.cost.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{formatTimeAgo(session.updatedAt)}</span>
                  </div>
                </div>
                
                {session.status === "running" && (
                  <div className="flex justify-end pt-2">
                    <Button variant="destructive" size="sm">
                      <StopCircle className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}