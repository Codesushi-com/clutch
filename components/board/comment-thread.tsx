"use client"

import type { Comment } from "@/lib/db/types"
import { formatDistanceToNow } from "date-fns"
import { Zap, CheckCircle, ArrowRight, MessageSquare } from "lucide-react"
import { Avatar } from "@/components/ui/avatar"

interface CommentThreadProps {
  comments: Comment[]
}

const AUTHOR_COLORS: Record<string, string> = {
  ada: "#a855f7",
  "kimi-coder": "#3b82f6",
  "sonnet-reviewer": "#22c55e",
  "haiku-triage": "#eab308",
  dan: "#ef4444",
}

const TYPE_INDICATORS: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  request_input: { 
    icon: <Zap className="h-3 w-3" />, 
    label: "REQUEST INPUT", 
    color: "#eab308" 
  },
  completion: { 
    icon: <CheckCircle className="h-3 w-3" />, 
    label: "COMPLETED", 
    color: "#22c55e" 
  },
  status_change: { 
    icon: <ArrowRight className="h-3 w-3" />, 
    label: "STATUS", 
    color: "#52525b" 
  },
}

export function CommentThread({ comments }: CommentThreadProps) {
  if (comments.length === 0) {
    return (
      <div className="text-center py-8">
        <MessageSquare className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2" />
        <p className="text-sm text-[var(--text-muted)]">No comments yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {comments.map((comment, index) => {
        const authorColor = AUTHOR_COLORS[comment.author] || "#52525b"
        const typeIndicator = TYPE_INDICATORS[comment.type]
        const isStatusChange = comment.type === "status_change"
        
        return (
          <div key={comment.id}>
            {/* Divider between comments (not before first) */}
            {index > 0 && (
              <div className="border-t border-[var(--border)] my-4" />
            )}
            
            <div className={`flex gap-3 ${isStatusChange ? "opacity-60" : ""}`}>
              {/* Avatar */}
              <Avatar author={comment.author} />
              
              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-[var(--text-primary)]">
                    {comment.author}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {formatDistanceToNow(comment.created_at, { addSuffix: true })}
                  </span>
                  
                  {/* Type indicator */}
                  {typeIndicator && (
                    <span 
                      className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded"
                      style={{ 
                        backgroundColor: `${typeIndicator.color}20`,
                        color: typeIndicator.color 
                      }}
                    >
                      {typeIndicator.icon}
                      {typeIndicator.label}
                    </span>
                  )}
                </div>
                
                {/* Message */}
                <div className="mt-1 text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                  {comment.content}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
