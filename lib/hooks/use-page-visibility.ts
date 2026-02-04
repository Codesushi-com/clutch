"use client"

import { useEffect, useState, useRef } from "react"

/**
 * Hook to detect page visibility changes (tab switching)
 * Returns current visibility state and provides callbacks for visibility events
 */
export function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(!document.hidden)
  const onVisibleCallbacksRef = useRef<(() => void)[]>([])
  const onHiddenCallbacksRef = useRef<(() => void)[]>([])

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = !document.hidden
      setIsVisible(visible)
      
      // Execute callbacks based on visibility state
      if (visible) {
        onVisibleCallbacksRef.current.forEach(callback => {
          try {
            callback()
          } catch (error) {
            console.error("[PageVisibility] Error in onVisible callback:", error)
          }
        })
      } else {
        onHiddenCallbacksRef.current.forEach(callback => {
          try {
            callback()
          } catch (error) {
            console.error("[PageVisibility] Error in onHidden callback:", error)
          }
        })
      }
    }

    // Listen for visibility changes
    document.addEventListener("visibilitychange", handleVisibilityChange)

    // Also listen for focus/blur as backup for older browsers
    window.addEventListener("focus", () => {
      if (document.hidden) return // Only fire if document is actually visible
      setIsVisible(true)
      onVisibleCallbacksRef.current.forEach(callback => {
        try {
          callback()
        } catch (error) {
          console.error("[PageVisibility] Error in focus callback:", error)
        }
      })
    })

    window.addEventListener("blur", () => {
      setIsVisible(false)
      onHiddenCallbacksRef.current.forEach(callback => {
        try {
          callback()
        } catch (error) {
          console.error("[PageVisibility] Error in blur callback:", error)
        }
      })
    })

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleVisibilityChange)
      window.removeEventListener("blur", handleVisibilityChange)
    }
  }, [])

  // Register callback for when page becomes visible
  const onVisible = (callback: () => void) => {
    onVisibleCallbacksRef.current.push(callback)
    
    // Return cleanup function
    return () => {
      onVisibleCallbacksRef.current = onVisibleCallbacksRef.current.filter(cb => cb !== callback)
    }
  }

  // Register callback for when page becomes hidden
  const onHidden = (callback: () => void) => {
    onHiddenCallbacksRef.current.push(callback)
    
    // Return cleanup function
    return () => {
      onHiddenCallbacksRef.current = onHiddenCallbacksRef.current.filter(cb => cb !== callback)
    }
  }

  return {
    isVisible,
    onVisible,
    onHidden,
  }
}