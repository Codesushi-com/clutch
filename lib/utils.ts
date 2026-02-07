import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface FormatDistanceOptions {
  addSuffix?: boolean
}

/**
 * Format a timestamp as a compact relative time string
 * Examples: "2m", "1h", "3d"
 */
export function formatCompactTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) {
    return `${seconds}s`
  } else if (minutes < 60) {
    return `${minutes}m`
  } else if (hours < 24) {
    return `${hours}h`
  } else {
    return `${days}d`
  }
}

export function formatDistanceToNow(timestamp: number, options?: FormatDistanceOptions): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  let result: string

  if (seconds < 10) {
    result = "just now"
  } else if (seconds < 60) {
    result = `${seconds} seconds ago`
  } else if (minutes < 2) {
    result = "1 minute ago"
  } else if (minutes < 60) {
    result = `${minutes} minutes ago`
  } else if (hours < 2) {
    result = "1 hour ago"
  } else if (hours < 24) {
    result = `${hours} hours ago`
  } else if (days < 2) {
    result = "1 day ago"
  } else {
    result = `${days} days ago`
  }

  if (options?.addSuffix && !result.includes("ago")) {
    result = result + " ago"
  }

  return result
}

/**
 * Format a timestamp as a concise absolute time
 * - Today: "10:32 PM"
 * - This year: "Feb 6 10:32 PM"
 * - Different year: "Feb 6, 2025 10:32 PM"
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const isThisYear = date.getFullYear() === now.getFullYear()

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }

  if (isToday) {
    return date.toLocaleTimeString(undefined, timeOptions)
  }

  const dateTimeOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }

  if (!isThisYear) {
    dateTimeOptions.year = "numeric"
  }

  return date.toLocaleString(undefined, dateTimeOptions)
}
