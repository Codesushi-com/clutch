"use client"

import { useState, useRef, useCallback } from "react"
import { Mic, Square, Loader2, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Message {
  role: "user" | "assistant"
  text: string
  audioUrl?: string
}

export default function VoicePage() {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      })

      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        await processAudio(audioBlob)
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      setError("Could not access microphone. Make sure you have HTTPS or localhost.")
      console.error("Mic access error:", err)
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsProcessing(true)
    }
  }, [isRecording])

  const processAudio = async (audioBlob: Blob) => {
    try {
      const formData = new FormData()
      formData.append("audio", audioBlob, "recording.webm")

      const response = await fetch("/api/voice", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to process audio")
      }

      const data = await response.json()

      // Add messages
      setMessages((prev) => [
        ...prev,
        { role: "user", text: data.transcript },
        { role: "assistant", text: data.response, audioUrl: data.audioUrl },
      ])

      // Play response audio
      if (data.audioUrl) {
        playAudio(data.audioUrl)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process")
    } finally {
      setIsProcessing(false)
    }
  }

  const playAudio = (url: string) => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    const audio = new Audio(url)
    audioRef.current = audio
    audio.play()
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center py-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center justify-center gap-2">
          <Volume2 className="h-6 w-6" />
          Voice Channel
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Hold to talk, release to send
        </p>
      </div>

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto px-4 space-y-4 mb-4">
        {messages.length === 0 && !isProcessing && (
          <div className="text-center text-[var(--text-muted)] py-12">
            <Mic className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p>Hold the mic button and speak to Ada</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                msg.role === "user"
                  ? "bg-[var(--accent-blue)] text-white"
                  : "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
              }`}
            >
              <p className="text-sm">{msg.text}</p>
              {msg.audioUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-6 px-2 text-xs opacity-70 hover:opacity-100"
                  onClick={() => playAudio(msg.audioUrl!)}
                >
                  <Volume2 className="h-3 w-3 mr-1" />
                  Replay
                </Button>
              )}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex justify-center py-4">
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Processing...</span>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="p-4 border-t border-[var(--border)]">
        <div className="flex justify-center">
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={isProcessing}
            className={`
              w-20 h-20 rounded-full flex items-center justify-center
              transition-all duration-200
              ${
                isRecording
                  ? "bg-red-500 scale-110 shadow-lg shadow-red-500/30"
                  : "bg-[var(--accent-blue)] hover:scale-105"
              }
              ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}
            `}
          >
            {isRecording ? (
              <Square className="h-8 w-8 text-white fill-white" />
            ) : (
              <Mic className="h-8 w-8 text-white" />
            )}
          </button>
        </div>
        <p className="text-center text-xs text-[var(--text-muted)] mt-3">
          {isRecording
            ? "Release to send"
            : isProcessing
            ? "Processing..."
            : "Hold to talk"}
        </p>
      </div>

      {/* Hidden audio element for playback */}
      <audio ref={audioRef} className="hidden" />
    </div>
  )
}
