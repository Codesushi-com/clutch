# Message Queue Recovery Implementation

## Overview

This implementation adds comprehensive message queue recovery for gateway restart/reconnect scenarios, ensuring messages don't get stuck in intermediate states and providing user-facing retry mechanisms.

## Changes Made

### 1. Enhanced Convex Schema (`convex/schema.ts`)

Added new fields to `chatMessages` table:
- `retry_count` (optional number): Tracks retry attempts for circuit breaker
- `cooldown_until` (optional number): Timestamp when rate limit cooldown expires  
- `failure_reason` (optional string): Human-readable failure explanation

### 2. Updated Convex Mutations/Queries (`convex/chats.ts`)

**New mutations:**
- `retryMessage`: Resets delivery status and increments retry count
- `markMessagesAsFailed`: Bulk mark messages as failed with reason
- `addSystemMessage`: Add recovery notifications to chats

**New queries:**
- `getStuckMessages`: Get messages older than age threshold in transitional states

**Enhanced existing functions:**
- All message-related mutations/queries now support new fields
- Updated return types to include retry_count, cooldown_until, failure_reason

### 3. Enhanced clutch-channel Plugin (`plugins/clutch-channel.ts`)

**Startup Recovery:**
- `handleStartupRecovery()`: Uses bulk recovery API to handle restart scenario
- Marks messages older than 5 minutes as failed
- Adds system notifications to affected chats

**Heartbeat Monitoring:**
- `startHeartbeatMonitoring()`: Runs every 30 seconds to check stuck messages
- Different timeout thresholds:
  - Processing: 3 minutes
  - Delivered: 30 seconds  
  - Sent: 5 minutes (with retry logic)

**Cooldown Handling:**
- `handleCooldown()`: Manages rate limit responses from gateway
- Keeps messages in "sent" state during cooldown
- Auto-retries when cooldown expires
- Basic cooldown duration parsing from error messages

**Enhanced Error Handling:**
- Detects cooldown/rate limit errors
- Sets appropriate failure reasons
- Circuit breaker logic with max retry attempts

### 4. New API Endpoints

**Message Retry:** `POST /api/chats/[id]/messages/[messageId]/retry`
- Allows retrying individual failed messages
- Enforces max retry limit (3 attempts)
- Resets delivery status to "sent"

**Bulk Recovery:** `POST /api/chats/messages/recover`
- Bulk operations for stuck message recovery
- Supports "mark_failed" and "retry" actions
- Adds system messages to affected chats

**Enhanced Status Update:** `PATCH /api/chats/[id]/messages/[messageId]/status`
- Now supports retry_count, cooldown_until, failure_reason fields

**Enhanced Stuck Messages:** `GET /api/chats/messages/stuck`
- Uses new `getStuckMessages` query with age threshold
- Configurable age threshold via query parameter

### 5. Configuration

All timeouts and thresholds are configurable via `RECOVERY_CONFIG` in the plugin:
- Startup recovery threshold: 5 minutes
- Heartbeat interval: 30 seconds
- Processing timeout: 3 minutes
- Delivered timeout: 30 seconds
- Max retry attempts: 3

## Key Features

### Startup Recovery
- On plugin initialization, checks for stuck messages
- Messages older than 5 minutes are marked as failed
- System notifications inform users about recovery actions

### Heartbeat Monitoring  
- Continuous monitoring every 30 seconds
- Different timeout strategies per message state
- Automatic retry for "sent" messages before marking as failed

### User-Facing Retry
- Failed messages can be manually retried via API
- Circuit breaker prevents infinite retry loops
- Clear failure reasons provided to users

### Graceful Cooldown Handling
- Rate limit errors don't immediately fail messages
- Messages stay in "sent" state with cooldown timestamp
- Automatic retry when cooldown expires
- User sees "waiting for model availability" instead of error

### System Resilience
- No messages silently disappear
- Clear audit trail via delivery status transitions
- Bulk operations for efficient recovery
- Defensive error handling throughout

## Testing Recommendations

1. **Gateway Restart**: Stop/start OpenClaw and verify stuck messages are recovered
2. **Timeout Scenarios**: Let messages sit in each state beyond timeout thresholds
3. **Rate Limiting**: Trigger rate limits and verify cooldown behavior
4. **Manual Retry**: Test UI retry buttons on failed messages
5. **Bulk Recovery**: Use recovery API to handle multiple stuck messages

## Future Enhancements

- Frontend UI components for retry buttons
- More sophisticated cooldown duration parsing
- Configurable timeouts per project
- Metrics and alerting for message failures
- Dead letter queue for permanently failed messages