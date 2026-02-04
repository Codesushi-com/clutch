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
      subscribe('chat.typing.start', (data: { runId: string; sessionKey?: string }) => {
        // Only handle events for our session
        if (!data.sessionKey || data.sessionKey === sessionKey) {
          onTypingStartRef.current?.(data.runId);
        }
      }),
      
      subscribe('chat.typing.end', (data: { sessionKey?: string } | undefined) => {
        // Only handle events for our session
        if (!data?.sessionKey || data.sessionKey === sessionKey) {
          onTypingEndRef.current?.();
        }
      }),
      
      subscribe('chat.delta', ({ delta, runId, sessionKey: eventSessionKey }: { delta: string; runId: string; sessionKey?: string }) => {
        // Only handle events for our session
        if (!eventSessionKey || eventSessionKey === sessionKey) {
          onDeltaRef.current?.(delta, runId);
        }
      }),
      
      subscribe('chat.message', ({ message, runId, sessionKey: eventSessionKey }: { message: ChatMessage; runId: string; sessionKey?: string }) => {
        // Only handle events for our session
        if (!eventSessionKey || eventSessionKey === sessionKey) {
          onMessageRef.current?.(message, runId);
        }
      }),
      
      subscribe('chat.error', ({ error, runId, sessionKey: eventSessionKey }: { error: string; runId: string; sessionKey?: string }) => {
        // Only handle events for our session
        if (!eventSessionKey || eventSessionKey === sessionKey) {
          onErrorRef.current?.(error, runId);
        }
      })
    ];

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [enabled, subscribe, sessionKey]);

  // Send a chat message
  const sendMessage = useCallback(async (message: string, trapChatId?: string): Promise<string> => {
    if (!enabled) {
      throw new Error("Chat hook is disabled");
    }

    return sendChatMessage(message, sessionKey, trapChatId);
  }, [enabled, sendChatMessage, sessionKey]);

  // Abort current chat response
  const abortChat = useCallback(async (): Promise<void> => {
    if (!enabled) {
      throw new Error("Chat hook is disabled");
    }

    return rpc("chat.abort", { sessionKey });
  }, [enabled, rpc, sessionKey]);

  return {
    connected: status === 'connected',
    sending: isSending,
    sendMessage,
    abortChat,
    rpc,
  };
}