"use client";

import { useCallback, useEffect, useRef } from "react";
import { useOpenClawWS } from "@/lib/providers/openclaw-ws-provider";

type ChatMessage = {
  role: "user" | "assistant";
  content: string | Array<{ type: string; text?: string }>;
  timestamp?: number;
};

type UseOpenClawChatOptions = {
  sessionKey?: string;
  onDelta?: (delta: string, runId: string) => void;
  onMessage?: (message: ChatMessage, runId: string) => void;
  onError?: (error: string, runId: string) => void;
  onTypingStart?: (runId: string) => void;
  onTypingEnd?: () => void;
  enabled?: boolean;
};

export function useOpenClawChat({
  sessionKey = "main",
  onDelta,
  onMessage,
  onError,
  onTypingStart,
  onTypingEnd,
  enabled = true,
}: UseOpenClawChatOptions = {}) {
  const { status, rpc, subscribe, sendChatMessage, isSending } = useOpenClawWS();
  
  // Store callbacks in refs so they don't cause re-subscriptions
  const onDeltaRef = useRef(onDelta);
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const onTypingStartRef = useRef(onTypingStart);
  const onTypingEndRef = useRef(onTypingEnd);

  // Keep refs updated
  useEffect(() => {
    onDeltaRef.current = onDelta;
    onMessageRef.current = onMessage;
    onErrorRef.current = onError;
    onTypingStartRef.current = onTypingStart;
    onTypingEndRef.current = onTypingEnd;
  }, [onDelta, onMessage, onError, onTypingStart, onTypingEnd]);

  // Subscribe to chat events
  useEffect(() => {
    if (!enabled) return;

    const unsubscribers = [
      subscribe('chat.typing.start', (runId: string) => {
        onTypingStartRef.current?.(runId);
      }),
      
      subscribe('chat.typing.end', () => {
        onTypingEndRef.current?.();
      }),
      
      subscribe('chat.delta', ({ delta, runId }: { delta: string; runId: string }) => {
        onDeltaRef.current?.(delta, runId);
      }),
      
      subscribe('chat.message', ({ message, runId }: { message: ChatMessage; runId: string }) => {
        onMessageRef.current?.(message, runId);
      }),
      
      subscribe('chat.error', ({ error, runId }: { error: string; runId: string }) => {
        onErrorRef.current?.(error, runId);
      })
    ];

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [enabled, subscribe]);

  // Send a chat message
  const sendMessage = useCallback(async (message: string, trapChatId?: string): Promise<string> => {
    if (!enabled) {
      throw new Error("Chat hook is disabled");
    }

    return sendChatMessage(message, sessionKey, trapChatId);
  }, [enabled, sendChatMessage, sessionKey]);

  return {
    connected: status === 'connected',
    sending: isSending,
    sendMessage,
    rpc,
  };
}