import { NextRequest, NextResponse } from "next/server"
import { writeFile, readFile, unlink } from "fs/promises"
import { exec } from "child_process"
import { promisify } from "util"
import { join } from "path"
import { tmpdir } from "os"
import crypto from "crypto"

const execAsync = promisify(exec)

// Use local Qwen3-TTS for voice synthesis
const TTS_SCRIPT = "/home/dan/src/qwen3-tts-test/simple_tts.py"
const ADA_VOICE = "ada"

export async function POST(request: NextRequest) {
  const tempFiles: string[] = []

  try {
    const formData = await request.formData()
    const audioFile = formData.get("audio") as File

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 })
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
    await execAsync(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" -y 2>/dev/null`)

    // Transcribe with Whisper
    const whisperCmd = `cd /home/dan/src/openai-whisper && source .venv/bin/activate && whisper "${wavPath}" --model base --language en --output_format txt --output_dir "${tmpdir()}" 2>/dev/null`
    await execAsync(whisperCmd)

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
      const ttsCmd = `cd /home/dan/src/qwen3-tts-test && source .venv/bin/activate && python simple_tts.py "${response.replace(/"/g, '\\"')}" --voice ${ADA_VOICE} --output "${responseWavPath}" 2>/dev/null`
      await execAsync(ttsCmd)
    } catch (ttsError) {
      console.error("TTS error:", ttsError)
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
    await execAsync(`ffmpeg -i "${responseWavPath}" -c:a libopus -b:a 24000 "${responseWebmPath}" -y 2>/dev/null`)

    // Read audio file as base64
    const audioBuffer = await readFile(responseWebmPath)
    const audioBase64 = audioBuffer.toString("base64")
    const audioUrl = `data:audio/webm;base64,${audioBase64}`

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
