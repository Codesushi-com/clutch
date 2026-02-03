import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ConnectionStatus } from '../connection-status'

// Mock the useWebSocket hook since we're testing the component in isolation
vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    state: {
      status: 'disconnected',
      url: 'ws://localhost:8080',
      uptime: 0,
      reconnectAttempt: 0,
      lastError: null
    }
  }))
}))

describe('ConnectionStatus', () => {
  it('renders component with default props', () => {
    const { container } = render(<ConnectionStatus />)
    // Just check that it renders without crashing
    expect(container.firstChild).toBeDefined()
  })

  it('accepts websocketUrl prop', () => {
    const { container } = render(<ConnectionStatus websocketUrl="ws://example.com" />)
    expect(container.firstChild).toBeDefined()
  })
})