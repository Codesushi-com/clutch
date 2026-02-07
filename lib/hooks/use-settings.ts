"use client"

import { useState, useCallback } from 'react'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ChatSettings {
  // Settings can be added here in the future
}

const DEFAULT_SETTINGS: ChatSettings = {
}

const SETTINGS_KEY = 'trap-chat-settings'

function getInitialSettings(): ChatSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS
  }
  
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as ChatSettings
      return { ...DEFAULT_SETTINGS, ...parsed }
    }
  } catch (error) {
    console.warn('Failed to load settings from localStorage:', error)
  }
  
  return DEFAULT_SETTINGS
}

export function useSettings() {
  const [settings, setSettingsState] = useState<ChatSettings>(getInitialSettings)

  // Update a specific setting
  const updateSetting = useCallback(<K extends keyof ChatSettings>(
    key: K,
    value: ChatSettings[K]
  ) => {
    setSettingsState(prev => {
      const newSettings = { ...prev, [key]: value }
      
      // Persist to localStorage
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings))
      } catch (error) {
        console.warn('Failed to save settings to localStorage:', error)
      }
      
      return newSettings
    })
  }, [])

  return {
    settings,
    updateSetting,
  }
}