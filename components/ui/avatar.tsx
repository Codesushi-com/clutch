"use client"

import { useState } from "react"

const AUTHOR_COLORS: Record<string, string> = {
  ada: "#a855f7",
  "kimi-coder": "#3b82f6",
  "sonnet-reviewer": "#22c55e",
  "haiku-triage": "#eab308",
  dan: "#64748b",
}

interface AvatarProps {
  author: string
  className?: string
}

export function Avatar({ author, className = "w-8 h-8" }: AvatarProps) {
  const [imageError, setImageError] = useState(false)
  const authorColor = AUTHOR_COLORS[author] || "#52525b"
  
  // Use image for Ada if available, fallback to letter
  if (author === "ada" && !imageError) {
    return (
      <img
        src="/ada-avatar.png"
        alt="Ada"
        className={`${className} rounded-full object-cover flex-shrink-0`}
        onError={() => setImageError(true)}
      />
    )
  }
  
  // Letter circle fallback for all others or if Ada's image fails
  return (
    <div 
      className={`${className} rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0`}
      style={{ backgroundColor: authorColor }}
    >
      {author.charAt(0).toUpperCase()}
    </div>
  )
}