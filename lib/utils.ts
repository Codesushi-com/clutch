import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface FormatDistanceOptions {
  addSuffix?: boolean
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
