# The Trap

AI agent orchestration system where Ada serves as coordinator for specialized sub-agents.

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run production server
PORT=3002 npm run start
```

**Dev URL:** http://192.168.7.200:3002  
**Prod URL:** https://ada.codesushi.com

## Architecture

### Core Concept
- **Ada (Opus)** - Coordinator agent, maintains state via board
- **Worker Agents** - Stateless, fresh session per task (kimi-coder, sonnet-reviewer, haiku-triage)
- **Board** - Convex-backed task management (replaces GitHub Projects)
- **Chat** - Bidirectional communication with OpenClaw main session

### Tech Stack
- Next.js 15, TypeScript, React 19
- Convex (self-hosted) for real-time data
- Zustand for state management
- Tailwind + shadcn/ui
- Convex reactivity for real-time updates

## Database

Trap uses **Convex** (self-hosted) for real-time data synchronization.

### Tables
- `projects` - Project metadata, repo links
- `tasks` - Kanban tasks with status, priority, assignee
- `comments` - Task comments for agent communication
- `chats` - Chat threads per project
- `chat_messages` - Chat message history
- `signals` - Agent signals (questions, blockers, alerts)
- `notifications` - System notifications
- `events` - Activity log

### Convex Setup

Convex runs locally via Docker:
```bash
# Start Convex (if not already running)
docker start convex-local  # or check docker-compose

# Deploy schema changes
npx convex deploy --url http://127.0.0.1:3210 --admin-key '<admin-key>'
```

The Convex URL is configured via `NEXT_PUBLIC_CONVEX_URL` (defaults to `http://127.0.0.1:3210`).

## OpenClaw Integration

### WebSocket Chat

The Trap connects to OpenClaw via WebSocket for real-time chat. The connection uses OpenClaw's protocol v3:

```javascript
// Connect handshake (first message required)
{
  type: "req",
  id: "<uuid>",
  method: "connect",
  params: {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: "webchat",
      version: "1.0.0", 
      platform: "web",
      mode: "webchat"
    },
    auth: { token: "<OPENCLAW_TOKEN>" }
  }
}

// RPC request format
{
  type: "req",
  id: "<uuid>",
  method: "<method>",
  params: { ... }
}

// Response format
{
  type: "res",
  id: "<uuid>",
  ok: true/false,
  payload: { ... },
  error: { code, message }
}

// Event format  
{
  type: "event",
  event: "<event-name>",
  payload: { ... }
}
```

### Channel Plugin

The trap-channel plugin enables bidirectional messaging:
- Plugin location: `plugins/trap-channel.ts`
- Symlink to: `~/.openclaw/extensions/trap-channel.ts`
- Manifest: `~/.openclaw/extensions/openclaw.plugin.json`

## Nginx Configuration

For HTTPS deployment, WebSocket connections need to be proxied through nginx to avoid mixed-content errors.

Add to nginx custom config (`/data/nginx/custom/server_proxy.conf` in NPM):

```nginx
# OpenClaw WebSocket proxy (for Trap app)
location = /openclaw-ws {
    proxy_pass http://192.168.7.200:18789/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Origin $http_origin;
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
    proxy_buffering off;
    proxy_cache off;
}
```

After updating, reload nginx:
```bash
docker exec nginx-proxy-manager nginx -t && docker exec nginx-proxy-manager nginx -s reload
```

## Environment Variables

Create `.env.local`:

```bash
# OpenClaw API (server-side)
OPENCLAW_HOOKS_URL=http://localhost:18789/hooks
OPENCLAW_HOOKS_TOKEN=<your-hooks-token>

# OpenClaw WebSocket (client-side, for HTTP dev only)
NEXT_PUBLIC_OPENCLAW_WS_URL=ws://192.168.7.200:18789/ws
NEXT_PUBLIC_OPENCLAW_TOKEN=<your-gateway-token>

# For HTTPS, WebSocket URL is auto-detected as wss://<host>/openclaw-ws
```

## Project Structure

```
trap/
├── app/                    # Next.js app router
│   ├── api/               # API routes
│   │   ├── chats/         # Chat CRUD
│   │   ├── tasks/         # Task CRUD
│   │   ├── projects/      # Project CRUD
│   │   ├── signal/        # Agent signal API
│   │   └── gate/          # Wake condition API
│   └── projects/[slug]/   # Project pages (board, chat, etc)
├── components/            # React components
│   ├── board/            # Kanban board components
│   ├── chat/             # Chat UI components
│   └── providers/        # Context providers
├── lib/
│   ├── db/               # Database (schema, migrations)
│   ├── hooks/            # React hooks (useOpenClawChat, etc)
│   └── stores/           # Zustand stores
├── plugins/              # OpenClaw plugins
│   └── trap-channel.ts   # Channel plugin for bidirectional chat
└── bin/
    └── trap-cli-gate.sh  # Gate script for cron-based wakeups
```

## Voice Chat Setup

The Trap includes a complete voice chat system with speech-to-text (Whisper) and text-to-speech (Qwen3-TTS) capabilities.

### Prerequisites

**1. OpenAI Whisper (STT)**

Install via pipx for isolated environment:
```bash
pipx install openai-whisper
```

Verify installation:
```bash
whisper --help
# Should show: /home/dan/.local/bin/whisper
```

**2. Qwen3-TTS (TTS)**

The Ada voice is already set up at `/home/dan/src/qwen3-tts-test/` with:
- Voice model: `voices/ada_voice.pt`
- Voice config: `voices/ada_voice.json` 
- Reference audio: `voices/ada_reference.wav`

Test TTS generation:
```bash
cd /home/dan/src/qwen3-tts-test
uv run python simple_tts.py "Hello, this is a test" --voice ada
```

**3. FFmpeg (Audio Conversion)**

Should already be installed system-wide:
```bash
which ffmpeg
# Should show: /usr/bin/ffmpeg
```

If not installed:
```bash
sudo apt install ffmpeg  # Ubuntu/Debian
brew install ffmpeg      # macOS
```

### Voice Chat Pipeline

The voice chat system processes audio through this pipeline:

1. **Recording**: Browser captures audio via `MediaRecorder` (WebM format)
2. **Upload**: Audio uploaded to `/api/voice` endpoint
3. **Conversion**: FFmpeg converts WebM → WAV for Whisper compatibility
4. **STT**: Whisper transcribes audio to text
5. **Processing**: Ada generates response (currently prototype echo)
6. **TTS**: Qwen3-TTS synthesizes response with Ada voice
7. **Conversion**: FFmpeg converts WAV → WebM for browser playback
8. **Response**: Client receives transcript, response text, and audio URL

### Using Voice Chat

**Access**: Navigate to `/projects/{slug}/voice` in any project.

**Browser Requirements**:
- **HTTPS required** for microphone access (Chrome security policy)
- **Dev workaround**: Use `localhost:3002` (Chrome allows localhost over HTTP)

**Usage**:
1. Allow microphone access when prompted
2. Hold the mic button and speak (1-3 seconds recommended)
3. Release to send - processing will start automatically
4. Ada's response will appear as text and play as audio
5. Click "Replay" to hear previous responses again

**Troubleshooting**:
- **"Could not access microphone"** → Check HTTPS/localhost, allow microphone permission
- **"Failed to process audio"** → Check Whisper installation, try shorter recordings
- **No audio response but text works** → Check TTS setup, see logs for TTS errors
- **"Audio file is empty"** → Hold mic button while speaking, ensure browser recording works

### Audio Format Support

**Recording Formats**:
- Primary: `audio/webm;codecs=opus` (modern browsers)
- Fallback: `audio/webm` (broader compatibility)
- Automatic browser capability detection

**Response Formats**:
- TTS generates WAV (high quality)
- Converted to WebM Opus for efficient browser playback
- Base64 data URL for immediate playback (no file serving needed)

### Integration with OpenClaw

**Current**: Prototype with echo responses for testing voice pipeline.

**Future**: Will integrate with main OpenClaw session to:
- Send voice transcripts as messages to Ada
- Receive real AI responses back
- Maintain conversation context across voice/text interactions

### Debugging Voice Issues

Check component status:
```bash
# Test Whisper
whisper --version

# Test TTS
cd /home/dan/src/qwen3-tts-test && uv run python simple_tts.py "test" --voice ada

# Test FFmpeg
ffmpeg -version

# Check API logs
tail -f .next/trace
```

API logging includes detailed processing steps for debugging audio pipeline issues.

## Development Notes

### Running Trap Server

Production mode (recommended for HTTPS testing):
```bash
cd /home/dan/src/trap
npm run build
PORT=3002 npm run start
```

Development mode:
```bash
npm run dev
```

### Debugging WebSocket

Check OpenClaw logs for connection issues:
```bash
journalctl --user -u openclaw-gateway.service -f --no-pager | grep -i ws
```

Common issues:
- **"invalid handshake"** - First message must be `connect` with proper params
- **"protocol mismatch"** - Use protocol version 3
- **"Mixed Content"** - HTTPS pages need WSS via nginx proxy
- **"invalid request frame"** - All requests need `type: "req"` field
