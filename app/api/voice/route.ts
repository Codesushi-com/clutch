import { NextRequest, NextResponse } from "next/server"
import { writeFile, readFile, unlink } from "fs/promises"
import { exec } from "child_process"
import { promisify } from "util"
import { join } from "path"
import { tmpdir } from "os"
import crypto from "crypto"

const execAsync = promisify(exec)

// Use local Qwen3-TTS for voice synthesis
const ADA_VOICE = "ada"

export async function POST(request: NextRequest) {
  const tempFiles: string[] = []

  try {
    const formData = await request.formData()
    const audioFile = formData.get("audio") as File

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 })
    }

    // Log request details for debugging
    console.log(`[Voice API] Processing audio: ${audioFile.name}, size: ${audioFile.size} bytes, type: ${audioFile.type}`)

    // Validate audio file
    if (audioFile.size === 0) {
      return NextResponse.json({ error: "Audio file is empty" }, { status: 400 })
    }

    if (audioFile.size > 10 * 1024 * 1024) { // 10MB limit
      return NextResponse.json({ error: "Audio file too large (max 10MB)" }, { status: 400 })
    }

    // Generate unique temp file names
    const id = crypto.randomUUID()
    const inputPath = join(tmpdir(), `voice-${id}.webm`)
    const wavPath = join(tmpdir(), `voice-${id}.wav`)
    const transcriptPath = join(tmpdir(), `voice-${id}.txt`)
    const responseWavPath = join(tmpdir(), `voice-response-${id}.wav`)
    tempFiles.push(inputPath, wavPath, transcriptPath, responseWavPath)

    // Save uploaded audio
    const bytes = await audioFile.arrayBuffer()
    await writeFile(inputPath, Buffer.from(bytes))

    // Convert webm to wav for whisper
    try {
      await execAsync(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" -y 2>/dev/null`)
      console.log(`[Voice API] Audio conversion successful: ${inputPath} -> ${wavPath}`)
    } catch (ffmpegError) {
      console.error(`[Voice API] FFmpeg conversion failed:`, ffmpegError)
      return NextResponse.json({ error: "Failed to convert audio format" }, { status: 500 })
    }

    // Transcribe with Whisper (installed via pipx)
    let transcript = ""
    try {
      const whisperCmd = `/home/dan/.local/share/pipx/venvs/openai-whisper/bin/whisper "${wavPath}" --model base --language en --output_format txt --output_dir "${tmpdir()}" 2>/dev/null`
      await execAsync(whisperCmd)
      console.log(`[Voice API] Whisper transcription successful`)
    } catch (whisperError) {
      console.error(`[Voice API] Whisper transcription failed:`, whisperError)
      return NextResponse.json({ error: "Failed to transcribe audio" }, { status: 500 })
    }

    // Read transcript (whisper outputs to input name + .txt)
    const whisperOutputPath = wavPath.replace(".wav", ".txt")
    const transcript = await readFile(whisperOutputPath, "utf-8").catch(() => "")
    const cleanTranscript = transcript.trim() || "I didn't catch that"

    // Get response from Ada (simulate for prototype - use simple logic or call to main agent)
    // For prototype, we'll use a simple echo response
    // In production, this would call the LLM
    const response = `You said: "${cleanTranscript}". This is a prototype response.`

    // Generate TTS with Ada voice
    try {
      const ttsCmd = `cd /home/dan/src/qwen3-tts-test && /home/dan/.local/bin/uv run python simple_tts.py "${response.replace(/"/g, '\\"')}" --voice ${ADA_VOICE} --output "${responseWavPath}"`
      console.log(`[Voice API] Starting TTS generation...`)
      await execAsync(ttsCmd, { timeout: 30000 })
      console.log(`[Voice API] TTS generation successful: ${responseWavPath}`)
    } catch (ttsError) {
      console.error(`[Voice API] TTS generation failed:`, ttsError)
      // Fallback: return text without audio
      return NextResponse.json({
        transcript: cleanTranscript,
        response,
        audioUrl: null,
        warning: "TTS failed, text response only",
      })
    }

    // Convert wav to webm for browser playback (smaller)
    const responseWebmPath = join(tmpdir(), `voice-response-${id}.webm`)
    tempFiles.push(responseWebmPath)
    
    try {
      await execAsync(`ffmpeg -i "${responseWavPath}" -c:a libopus -b:a 24000 "${responseWebmPath}" -y 2>/dev/null`)
      console.log(`[Voice API] Response audio conversion successful: ${responseWavPath} -> ${responseWebmPath}`)
    } catch (conversionError) {
      console.error(`[Voice API] Response audio conversion failed:`, conversionError)
      return NextResponse.json({ error: "Failed to convert response audio" }, { status: 500 })
    }

    // Read audio file as base64
    let audioUrl = null
    try {
      const audioBuffer = await readFile(responseWebmPath)
      const audioBase64 = audioBuffer.toString("base64")
      audioUrl = `data:audio/webm;base64,${audioBase64}`
      console.log(`[Voice API] Response complete - transcript: "${cleanTranscript}", audio size: ${audioBuffer.length} bytes`)
    } catch (readError) {
      console.error(`[Voice API] Failed to read response audio:`, readError)
      return NextResponse.json({ error: "Failed to read response audio" }, { status: 500 })
    }

    // Cleanup temp files
    await Promise.all(tempFiles.map((f) => unlink(f).catch(() => {})))

    return NextResponse.json({
      transcript: cleanTranscript,
      response,
      audioUrl,
    })
  } catch (error) {
    // Cleanup on error
    await Promise.all(tempFiles.map((f) => unlink(f).catch(() => {})))

    console.error("Voice processing error:", error)
    return NextResponse.json(
      { error: "Failed to process audio" },
      { status: 500 }
    )
  }
}
