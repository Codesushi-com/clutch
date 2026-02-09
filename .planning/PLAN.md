# OpenClutch — Comprehensive Build Plan

> AI Agent Orchestration Dashboard for OpenClaw
> 
> "Where agents come to work, and work comes to life."

---

## Vision

OpenClutch is the control center for a coordinated AI agent system. It's where:
- **Ada** (the coordinator) manages work across projects
- **Specialized agents** execute tasks with clear handoffs
- **Dan** has full visibility into what's happening
- **Everything is beautiful** — because tools should be a joy to use

---

## Design Principles

### 1. Beauty First
- Modern, clean aesthetic with thoughtful whitespace
- Subtle animations that feel alive but not distracting
- Dark mode as the default (we work at night)
- Typography that's readable and elegant

### 2. Information Density Done Right
- Show what matters, hide what doesn't
- Progressive disclosure — click for details
- Real-time updates that don't overwhelm

### 3. Agent-Native
- Built for AI coordination, not retrofitted
- Task comments are first-class communication
- Session visibility is core, not an afterthought

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     OPENCLUTCH (UI)                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Project View                          │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │   │
│  │  │  Board  │  │  Chat   │  │Sessions │  │Settings │    │   │
│  │  │(Kanban) │  │(Threads)│  │ (Live)  │  │(Context)│    │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API LAYER                               │
│  /api/projects  /api/tasks  /api/comments  /api/chats          │
│  /api/sessions  /api/events  /api/agents                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
│   SQLite DB      │ │   OpenClaw   │ │  Project Files   │
│ (Tasks, Chats,   │ │   Gateway    │ │ (STANDARDS.md,   │
│  Comments, etc)  │ │  (Sessions)  │ │  CONTEXT.md)     │
└──────────────────┘ └──────────────┘ └──────────────────┘
```

---

## Data Model

### Projects
```typescript
interface Project {
  id: string
  slug: string           // URL-friendly name
  name: string
  description: string
  color: string          // Accent color for UI
  repoUrl?: string       // GitHub repo
  contextPath: string    // Path to project context files
  createdAt: Date
  updatedAt: Date
}
```

### Tasks
```typescript
interface Task {
  id: string
  projectId: string
  title: string
  description: string    // Markdown
  status: 'backlog' | 'ready' | 'in_progress' | 'review' | 'done'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assignee?: string      // Agent ID or null
  requiresHumanReview: boolean
  tags: string[]
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
}
```

### Comments (Task Communication)
```typescript
interface Comment {
  id: string
  taskId: string
  author: string         // 'ada', 'kimi-coder', 'dan', etc.
  authorType: 'coordinator' | 'agent' | 'human'
  content: string        // Markdown
  type: 'message' | 'status_change' | 'request_input' | 'completion'
  createdAt: Date
}
```

### Chats (Project Conversations)
```typescript
interface Chat {
  id: string
  projectId: string
  title: string
  participants: string[] // Agent IDs
  createdAt: Date
  updatedAt: Date
}

interface ChatMessage {
  id: string
  chatId: string
  author: string
  content: string
  createdAt: Date
}
```

### Events (Activity Feed)
```typescript
interface Event {
  id: string
  projectId?: string
  taskId?: string
  type: 'task_created' | 'task_moved' | 'comment_added' | 'agent_started' | 'agent_completed' | ...
  actor: string
  data: Record<string, any>
  createdAt: Date
}
```

---

## UI Components

### Global
- **Sidebar** — Project list, quick actions
- **Header** — Current project, search, user menu
- **Command Palette** — Quick navigation (⌘K)

### Project View
- **Board Tab** — Kanban with drag-and-drop
- **Chat Tab** — Threaded conversations
- **Sessions Tab** — Live agent sessions
- **Settings Tab** — Project context, agents

### Board
- **Column** — Status column with task count
- **TaskCard** — Compact task preview
- **TaskModal** — Full task detail with comments

### Chat
- **ChatList** — Sidebar of conversations
- **ChatThread** — Messages with agent avatars
- **ChatInput** — Markdown-enabled composer

### Sessions
- **SessionList** — Active sessions with status
- **SessionDetail** — Transcript viewer
- **SessionControls** — Stop, restart, etc.

---

## Visual Design

### Color Palette
```css
/* Dark theme (default) */
--bg-primary: #0a0a0b
--bg-secondary: #141415
--bg-tertiary: #1c1c1e
--border: #2a2a2c
--text-primary: #fafafa
--text-secondary: #a1a1aa
--text-muted: #52525b

/* Accents */
--accent-blue: #3b82f6
--accent-green: #22c55e
--accent-yellow: #eab308
--accent-red: #ef4444
--accent-purple: #a855f7

/* Status colors */
--status-backlog: #52525b
--status-ready: #3b82f6
--status-progress: #eab308
--status-review: #a855f7
--status-done: #22c55e
```

### Typography
- **Font**: Inter (UI), JetBrains Mono (code)
- **Sizes**: 12/14/16/20/24/32
- **Weights**: 400 (body), 500 (medium), 600 (semibold)

### Spacing
- Base unit: 4px
- Common: 8, 12, 16, 24, 32, 48

### Animations
- Transitions: 150ms ease
- Micro-interactions: subtle scale/opacity
- Drag feedback: shadow + slight lift

---

## Phase 1: Foundation (Sequential)

These must be done in order. Each assumes the previous is merged.

### 1.1 Database Schema + Migrations
**Goal**: SQLite database with all tables

**Deliverables**:
- `lib/db/schema.ts` — Table definitions
- `lib/db/migrations/` — Migration files
- `lib/db/index.ts` — Database connection
- `scripts/migrate.ts` — Migration runner

**Tables**: projects, tasks, comments, chats, chat_messages, events

---

### 1.2 Project API + List UI
**Goal**: Create/list projects, beautiful project cards

**Deliverables**:
- `app/api/projects/route.ts` — GET, POST
- `app/api/projects/[id]/route.ts` — GET, PATCH, DELETE
- `app/page.tsx` — Project grid with cards
- `components/projects/project-card.tsx`
- `components/projects/create-project-modal.tsx`

**UI**: Grid of project cards with color accents, hover states

---

### 1.3 Task API + Board Foundation
**Goal**: Full task CRUD, basic board layout

**Deliverables**:
- `app/api/tasks/route.ts` — GET (with filters), POST
- `app/api/tasks/[id]/route.ts` — GET, PATCH, DELETE
- `app/projects/[slug]/page.tsx` — Project detail
- `app/projects/[slug]/board/page.tsx` — Board view
- `components/board/board.tsx` — Column layout
- `components/board/column.tsx` — Single column
- `components/board/task-card.tsx` — Task preview

**UI**: 5-column board, task cards with priority indicators

---

### 1.4 Drag-and-Drop + Task Modal
**Goal**: Interactive board with full task editing

**Deliverables**:
- Integrate `@hello-pangea/dnd` for drag-drop
- `components/board/task-modal.tsx` — Full task view
- Status transitions on drop
- Optimistic updates

**UI**: Smooth drag animations, modal with tabs

---

### 1.5 Comments API + Task Discussion
**Goal**: Comments on tasks, real-time updates

**Deliverables**:
- `app/api/tasks/[id]/comments/route.ts`
- `components/board/comment-thread.tsx`
- `components/board/comment-input.tsx`
- Comment type indicators (message, status, request)

**UI**: Threaded comments with author avatars, markdown rendering

---

## Phase 2: Chat System (Sequential)

### 2.1 Chat API + Data Model
**Goal**: Create chats, send messages

**Deliverables**:
- `app/api/chats/route.ts`
- `app/api/chats/[id]/route.ts`
- `app/api/chats/[id]/messages/route.ts`
- Chat store (Zustand)

---

### 2.2 Chat UI — List + Thread
**Goal**: Beautiful chat interface

**Deliverables**:
- `app/projects/[slug]/chat/page.tsx`
- `components/chat/chat-sidebar.tsx` — Chat list
- `components/chat/chat-thread.tsx` — Messages
- `components/chat/chat-input.tsx` — Composer
- `components/chat/message-bubble.tsx`

**UI**: 
- Sidebar with chat previews
- Messages with agent avatars and timestamps
- Markdown rendering with syntax highlighting
- Typing indicators (future: when agents are working)

---

### 2.3 Chat + Task Integration
**Goal**: Link chats to tasks, create tasks from chat

**Deliverables**:
- "Create task" action from chat message
- Link existing task to chat
- Task references render as cards in chat
- Comments sync between task and chat (optional)

---

## Phase 3: Session Visibility (Sequential)

### 3.1 Enhanced Session List
**Goal**: Sessions grouped by project, better status

**Deliverables**:
- `app/projects/[slug]/sessions/page.tsx`
- Filter sessions by project
- Status indicators (working, idle, stuck)
- Agent type badges

**UI**: Clean table with real-time status updates

---

### 3.2 Session Transcript Viewer
**Goal**: Beautiful transcript with tool calls

**Deliverables**:
- Enhance `app/sessions/[id]/page.tsx`
- Collapsible tool call blocks
- Syntax highlighting for code
- Copy buttons

**UI**: Chat-like transcript, clear tool call visualization

---

### 3.3 Session Controls
**Goal**: Stop, restart, send message to session

**Deliverables**:
- Control buttons in session detail
- Confirmation dialogs
- Send message input
- Session health indicators

---

## Phase 4: Agent Integration (Sequential)

### 4.1 Agent Registry
**Goal**: Define agents in the system

**Deliverables**:
- `lib/agents/registry.ts` — Agent definitions
- `app/api/agents/route.ts`
- Agent config in database or config file

**Agents**:
- `ada` — Coordinator (Opus)
- `kimi-coder` — Executor (Kimi)
- `sonnet-reviewer` — Evaluator (Sonnet)
- `haiku-triage` — Scanner (Haiku)

---

### 4.2 Task Dispatch
**Goal**: Assign task → spawn agent session

**Deliverables**:
- Dispatch logic in task update handler
- Agent session creation via OpenClaw
- Task ID + project context injection
- Session linking to task

---

### 4.3 Agent Communication Tools
**Goal**: Agents can request input, report completion

**Deliverables**:
- `request_input` — Creates comment, triggers notification
- `mark_complete` — Updates task status, creates summary
- `escalate` — Flags for coordinator attention

These become OpenClaw tools available to agent sessions.

---

### 4.4 Smart Gate Script
**Goal**: Efficient heartbeat that only wakes when needed

**Deliverables**:
- `bin/clutch-gate.sh` — Reads board state
- Wake conditions:
  - Tasks in Ready with no assignee
  - Comments requesting input
  - Tasks stuck > N hours
- Credit-efficient polling

---

## Phase 5: Polish (Can Parallelize)

### 5.1 Command Palette
- ⌘K to open
- Search projects, tasks, actions
- Keyboard navigation

### 5.2 Activity Feed
- Real-time event stream
- Filter by project/type
- Collapsible in sidebar

### 5.3 Notifications
- In-app notification center
- Badge counts
- Mark as read

### 5.4 Keyboard Shortcuts
- Board navigation
- Task actions
- Global shortcuts

### 5.5 Mobile Responsive
- Usable on tablet/phone
- Touch-friendly interactions

---

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui (customized)
- **Database**: SQLite (better-sqlite3)
- **State**: Zustand
- **Drag & Drop**: @hello-pangea/dnd
- **Icons**: Lucide React
- **Fonts**: Inter, JetBrains Mono

---

## File Structure

```
clutch/
├── app/
│   ├── api/
│   │   ├── projects/
│   │   ├── tasks/
│   │   ├── comments/
│   │   ├── chats/
│   │   ├── sessions/
│   │   ├── agents/
│   │   └── events/
│   ├── projects/
│   │   └── [slug]/
│   │       ├── page.tsx        # Redirect to board
│   │       ├── board/
│   │       ├── chat/
│   │       ├── sessions/
│   │       └── settings/
│   ├── sessions/
│   │   └── [id]/
│   ├── layout.tsx
│   └── page.tsx                # Project list
├── components/
│   ├── ui/                     # shadcn base
│   ├── layout/                 # Sidebar, Header
│   ├── projects/               # Project cards, modals
│   ├── board/                  # Kanban components
│   ├── chat/                   # Chat components
│   ├── sessions/               # Session components
│   └── shared/                 # Agent avatar, etc.
├── lib/
│   ├── db/                     # Database
│   ├── stores/                 # Zustand stores
│   ├── agents/                 # Agent registry
│   ├── api/                    # API client
│   └── utils.ts
├── scripts/
│   └── migrate.ts
└── public/
```

---

## Success Metrics

1. **Functional**: Can create project, add tasks, drag between columns
2. **Beautiful**: Passes the "would I screenshot this?" test
3. **Real-time**: Changes reflect instantly without refresh
4. **Integrated**: Tasks dispatch to agents, completion updates board
5. **Efficient**: Gate script uses minimal credits

---

## Open Questions

1. **Auth**: Do we need auth? Or is this single-user?
   - *Current thinking*: Single-user for now, add later if needed

2. **Persistence**: SQLite file location?
   - *Current thinking*: `~/.clutch/clutch.db`

3. **Project context files**: Where do they live?
   - *Current thinking*: `~/.clutch/projects/{slug}/`

---

*This document is the source of truth for the OpenClutch build.*
