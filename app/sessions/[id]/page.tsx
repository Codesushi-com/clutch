'use client';

/**
 * Session Detail Page
 * View detailed information about a specific session
 * Uses HTTP API instead of WebSocket
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, RotateCcw, Archive, AlertCircle, X, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '@/lib/stores/session-store';
import { useOpenClawHttpRpc } from '@/lib/hooks/use-openclaw-http';
import { SessionPreview } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  // Safely decode session ID, handling multiple encoding levels and special characters
  const sessionId = (() => {
    const rawId = params.id as string;
    try {
      // Handle double-encoded URLs and ensure proper decoding
      let decoded = decodeURIComponent(rawId);
      // If it looks like it might be double-encoded, try again
      if (decoded.includes('%')) {
        try {
          decoded = decodeURIComponent(decoded);
        } catch {
          // If second decode fails, use the first result
        }
      }
      return decoded;
    } catch (error) {
      console.error('[SessionDetail] Failed to decode session ID:', rawId, error);
      // Fallback to raw ID if decoding fails
      return rawId;
    }
  })();
  
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionPreview, setSessionPreview] = useState<SessionPreview | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isCompacting, setIsCompacting] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Simple toast function
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };
  
  const session = useSessionStore((state) => state.getSessionById(sessionId));
  const { getSessionPreview, resetSession, compactSession, cancelSession } = useOpenClawHttpRpc();

  // Load session preview data with timeout and retry logic
  useEffect(() => {
    const loadSessionPreview = async (attempt = 0) => {
      if (!sessionId) return;
      
      try {
        setIsLoading(true);
        setLoadError(null);
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout after 15 seconds')), 15000);
        });
        
        const dataPromise = getSessionPreview(sessionId);
        const preview = await Promise.race([dataPromise, timeoutPromise]);
        
        setSessionPreview(preview);
        setLoadError(null);
        setRetryCount(0);
      } catch (error) {
        console.error('Failed to load session preview:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setLoadError(errorMessage);
        
        // Auto-retry up to 3 times with exponential backoff
        if (attempt < 3) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          console.log(`[SessionDetail] Retrying in ${delay}ms (attempt ${attempt + 1}/3)`);
          setTimeout(() => {
            setRetryCount(attempt + 1);
            loadSessionPreview(attempt + 1);
          }, delay);
          return; // Don't set isLoading to false yet
        } else {
          showToast(`Failed to load session details: ${errorMessage}`, "error");
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadSessionPreview();
  }, [sessionId, getSessionPreview]);

  // Add manual retry function
  const retryLoad = () => {
    setRetryCount(0);
    const loadSessionPreview = async () => {
      if (!sessionId) return;
      
      try {
        setIsLoading(true);
        setLoadError(null);
        
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout after 15 seconds')), 15000);
        });
        
        const dataPromise = getSessionPreview(sessionId);
        const preview = await Promise.race([dataPromise, timeoutPromise]);
        
        setSessionPreview(preview);
        setLoadError(null);
      } catch (error) {
        console.error('Failed to load session preview:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setLoadError(errorMessage);
        showToast(`Failed to load session details: ${errorMessage}`, "error");
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSessionPreview();
  };

  // Handle session reset
  const handleResetSession = async () => {
    try {
      setIsResetting(true);
      setShowResetDialog(false);
      await resetSession(sessionId);
      showToast("Session has been reset successfully", "success");
      // Reload session preview after reset
      const preview = await getSessionPreview(sessionId);
      setSessionPreview(preview);
    } catch (error) {
      console.error('Failed to reset session:', error);
      showToast("Failed to reset session", "error");
    } finally {
      setIsResetting(false);
    }
  };

  // Handle session compact
  const handleCompactSession = async () => {
    try {
      setIsCompacting(true);
      await compactSession(sessionId);
      showToast("Session context has been compacted successfully", "success");
      // Reload session preview after compact
      const preview = await getSessionPreview(sessionId);
      setSessionPreview(preview);
    } catch (error) {
      console.error('Failed to compact session:', error);
      showToast("Failed to compact session context", "error");
    } finally {
      setIsCompacting(false);
    }
  };

  // Handle session cancel
  const handleCancelSession = async () => {
    try {
      setIsCanceling(true);
      await cancelSession(sessionId);
      showToast("Session has been canceled successfully", "success");
      // Reload session preview after cancel
      const preview = await getSessionPreview(sessionId);
      setSessionPreview(preview);
    } catch (error) {
      console.error('Failed to cancel session:', error);
      showToast("Failed to cancel session", "error");
    } finally {
      setIsCanceling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin mb-4" />
        <p className="text-muted-foreground text-center">
          Loading session details...
          {retryCount > 0 && (
            <span className="block text-sm mt-2">
              Retry attempt {retryCount}/3
            </span>
          )}
        </p>
      </div>
    );
  }

  if (loadError && !sessionPreview) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Button variant="ghost" onClick={() => router.push('/sessions')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Sessions
        </Button>
        <div className="rounded-lg border p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Failed to Load Session</h1>
          <p className="text-muted-foreground mb-4">
            {loadError}
          </p>
          <div className="flex gap-2 justify-center">
            <Button onClick={retryLoad} variant="outline">
              <RotateCcw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button variant="ghost" onClick={() => router.push('/sessions')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Sessions
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!sessionPreview && !isLoading && !loadError) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Button variant="ghost" onClick={() => router.push('/sessions')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Sessions
        </Button>
        <div className="rounded-lg border p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">Session Not Found</h1>
          <p className="text-muted-foreground mb-4">
            The session you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
          <Button variant="outline" onClick={retryLoad}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const displaySession = sessionPreview?.session || session;

  return (
    <div className="container mx-auto py-8 px-4">
      <Button variant="ghost" onClick={() => router.push('/sessions')} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Sessions
      </Button>

      <div className="rounded-lg border bg-card p-6">
        <div className="flex justify-between items-start mb-4">
          <h1 className="text-2xl font-bold">{displaySession?.name || sessionId}</h1>
          
          {/* Action Buttons */}
          <div className="flex gap-2">
            {/* Cancel Button - only show if session appears to be running */}
            {displaySession?.status !== 'idle' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelSession}
                disabled={isCanceling}
                title="Cancel running session"
              >
                {isCanceling ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Square className="h-4 w-4 mr-2" />
                )}
                Cancel
              </Button>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleCompactSession}
              disabled={isCompacting}
            >
              {isCompacting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Archive className="h-4 w-4 mr-2" />
              )}
              Compact Context
            </Button>
            
            <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isResetting}
                >
                  {isResetting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4 mr-2" />
                  )}
                  Reset Session
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reset Session</DialogTitle>
                  <DialogDescription>
                    This will permanently clear all conversation history for this session. This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowResetDialog(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleResetSession}>
                    Reset Session
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Session Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <div className="text-sm text-muted-foreground">Model</div>
            <div className="font-medium">{displaySession?.model}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Total Tokens</div>
            <div className="font-medium">{displaySession?.tokens.total.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Context Usage</div>
            <div className="font-medium">
              {sessionPreview?.contextPercentage 
                ? `${sessionPreview.contextPercentage.toFixed(1)}%`
                : 'Loading...'}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Last Updated</div>
            <div className="font-medium">
              {displaySession?.updatedAt 
                ? new Date(displaySession.updatedAt).toLocaleString()
                : 'Unknown'}
            </div>
          </div>
        </div>

        {/* Additional Session Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <div className="text-sm text-muted-foreground">Session ID</div>
            <div className="font-mono text-sm">{sessionId}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Type</div>
            <div className="capitalize">{displaySession?.type}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Status</div>
            <div className="capitalize">{displaySession?.status}</div>
          </div>
        </div>

        {/* Token Usage Breakdown */}
        <div className="border-t pt-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Token Usage Breakdown</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground">Input</div>
              <div className="text-2xl font-bold">{displaySession?.tokens.input.toLocaleString()}</div>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground">Output</div>
              <div className="text-2xl font-bold">{displaySession?.tokens.output.toLocaleString()}</div>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground">Total</div>
              <div className="text-2xl font-bold">{displaySession?.tokens.total.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Session History */}
        <div className="border-t pt-6">
          <h2 className="text-lg font-semibold mb-4">Conversation History</h2>
          {sessionPreview?.messages ? (
            <div className="h-96 w-full rounded-md border overflow-y-auto">
              <div className="p-4 space-y-4">
                {sessionPreview.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : message.role === 'assistant'
                          ? 'bg-muted'
                          : 'bg-secondary'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium capitalize">
                          {message.role}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(message.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                    </div>
                  </div>
                ))}
                {sessionPreview.messages.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No messages in this session yet.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-32 w-full rounded-md border flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading conversation history...
            </div>
          )}
        </div>

        {/* Parent Session Link */}
        {displaySession?.parentId && (
          <div className="border-t pt-6 mt-6">
            <div className="text-sm text-muted-foreground">Parent Session</div>
            <Button
              variant="link"
              className="p-0 h-auto font-mono"
              onClick={() => router.push(`/sessions/${encodeURIComponent(displaySession.parentId!)}`)}
            >
              {displaySession.parentId}
            </Button>
          </div>
        )}

        {/* HTTP API Note */}
        <div className="border-t pt-6 mt-6">
          <div className="flex items-center gap-2 text-blue-600">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">
              Using HTTP API for session operations. No WebSocket connection required.
            </span>
          </div>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-4 right-4 z-50">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg ${
              notification.type === 'success'
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            }`}
          >
            <span className="text-sm">{notification.message}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-white hover:text-gray-200"
              onClick={() => setNotification(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
