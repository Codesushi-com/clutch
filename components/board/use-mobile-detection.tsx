"use client"

import { useState, useEffect } from "react"

export function useMobileDetection(breakpoint: number = 768) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkViewport = () => {
      setIsMobile(window.innerWidth < breakpoint)
    }

    // Check on mount
    checkViewport()

    // Listen for resize events
    window.addEventListener("resize", checkViewport)

    return () => window.removeEventListener("resize", checkViewport)
  }, [breakpoint])

  return isMobile
}