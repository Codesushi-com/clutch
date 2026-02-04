#!/bin/bash
# trap-gate.sh — Gate script for OpenClaw cron
#
# Returns 0 (wake) if coordinator should process work
# Returns 1 (sleep) if nothing needs attention
#
# Usage: TRAP_URL=http://localhost:3002 ./trap-gate.sh

set -e

TRAP_URL="${TRAP_URL:-http://localhost:3002}"

# Fetch gate status
response=$(curl -s --max-time 5 "$TRAP_URL/api/gate" 2>/dev/null || echo '{"needsAttention":false,"error":"failed to connect"}')

# Check for errors
if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
  echo "Error: $(echo "$response" | jq -r '.error')" >&2
  exit 1
fi

# Parse response
needs_attention=$(echo "$response" | jq -r '.needsAttention')

if [ "$needs_attention" = "true" ]; then
  # Output reason for the cron logs
  reason=$(echo "$response" | jq -r '.reason // "needs attention"')
  echo "$reason"
  exit 0  # Wake up
else
  exit 1  # Stay asleep
fi
