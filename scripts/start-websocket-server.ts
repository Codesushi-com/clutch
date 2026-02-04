#!/usr/bin/env tsx

import { wsManager } from '../lib/websocket/server'

const port = process.env.WEBSOCKET_PORT ? parseInt(process.env.WEBSOCKET_PORT) : 3003

console.log(`Starting WebSocket server on port ${port}...`)

wsManager.initialize(port)

process.on('SIGINT', () => {
  console.log('Shutting down WebSocket server...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('Shutting down WebSocket server...')
  process.exit(0)
})

console.log(`WebSocket server is running on ws://localhost:${port}`)
console.log('Press Ctrl+C to stop the server')