# Demo Environment

The OpenClutch demo environment provides an isolated, self-contained instance for screenshots, demos, and onboarding. It runs a separate Convex backend on different ports to avoid conflicts with your production instance.

## Purpose

- **Screenshots** — Capture consistent UI screenshots for documentation
- **Demos** — Show off OpenClutch features without production data
- **Onboarding** — New contributors can explore the UI without affecting real projects
- **Testing** — Test UI changes with realistic, deterministic data

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Demo Environment                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐        ┌──────────────────────────────┐  │
│  │  Next.js Dev │◄──────►│  Convex Demo (port 3230)     │  │
│  │  Server      │        │  Dashboard: port 6811        │  │
│  │  Port 3002   │        │                              │  │
│  └──────────────┘        └──────────────────────────────┘  │
│         │                                                    │
│         └────────────────────────────────────────────────    │
│                        Uses .env.demo.local                  │
└─────────────────────────────────────────────────────────────┘
```

**Port Mapping:**

| Service | Production | Demo |
|---------|-----------|------|
| Convex API | 3210 | 3230 |
| Convex Dashboard | 3211 | 6811 |
| Next.js Dev | 3002 | 3002 |

## Quick Start

### 1. Start the Demo Environment

```bash
pnpm demo:up
```

This starts the demo Convex instance on ports 3230/6811.

### 2. Deploy the Schema

```bash
pnpm demo:deploy
```

Deploys the Convex schema to the demo instance.

### 3. Seed with Demo Data

```bash
pnpm demo:seed
```

Populates the database with realistic demo data:
- 4 projects (Acme API, Pixel UI, Data Pipeline, Mobile App)
- 40-50 tasks across all statuses
- Chat threads with messages
- Work loop history
- Sessions with cost tracking
- Roadmap with phases and features
- Prompt lab data

Use `--clean` to reset data:
```bash
pnpm demo:seed --clean
```

### 4. Start the Dev Server

```bash
pnpm demo:dev
```

Starts the Next.js dev server using `.env.demo.local` configuration.

### 5. View the Demo

- **OpenClutch UI**: http://localhost:3002
- **Convex Dashboard**: http://localhost:6811

## Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm demo:up` | Start the demo Convex instance |
| `pnpm demo:down` | Stop the demo Convex instance |
| `pnpm demo:reset` | Stop, remove volumes, and restart (clean slate) |
| `pnpm demo:deploy` | Deploy Convex schema to demo instance |
| `pnpm demo:seed` | Seed with demo data |
| `pnpm demo:seed --clean` | Clear existing data and re-seed |
| `pnpm demo:dev` | Start Next.js dev server with demo config |
| `pnpm demo:screenshots` | Script to capture screenshots (see below) |

## Complete Workflow

To get a fully populated demo environment:

```bash
# Start everything
pnpm demo:up && pnpm demo:deploy && pnpm demo:seed && pnpm demo:dev
```

Then open http://localhost:3002 to see the populated UI.

## Switching Between Demo and Production

### Point to Demo (isolated)

```bash
# Use the demo environment file
cp .env.demo .env.demo.local
# Edit .env.demo.local with your OpenClaw token
pnpm demo:dev
```

### Point to Production (real data)

```bash
# Use your regular environment
pnpm dev
```

The key difference is the Convex URL:
- **Demo**: `CONVEX_URL=http://127.0.0.1:3230`
- **Production**: `CONVEX_URL=http://127.0.0.1:3210`

## Re-seeding Data

To reset the demo data to its initial state:

```bash
# Option 1: Clean seed (preserves container)
pnpm demo:seed --clean

# Option 2: Full reset (removes volumes, fresh database)
pnpm demo:reset
pnpm demo:deploy
pnpm demo:seed
```

## Configuration

The demo environment uses `.env.demo` as a template. Copy it to `.env.demo.local` and customize:

```bash
cp .env.demo .env.demo.local
```

Key settings to update:
- `OPENCLAW_TOKEN` — Your OpenClaw gateway token
- `NEXT_PUBLIC_OPENCLAW_TOKEN` — Same token for client-side

## Screenshots

To capture screenshots for documentation:

### Manual Screenshots

1. Start the demo: `pnpm demo:up && pnpm demo:seed && pnpm demo:dev`
2. Open http://localhost:3002
3. Navigate to each page and capture screenshots

### Automated Screenshots (Experimental)

```bash
pnpm demo:screenshots
```

This runs a script that opens pages and captures screenshots. Note: Requires Playwright to be installed:

```bash
pnpm add -D @playwright/test
npx playwright install chromium
```

## Troubleshooting

### Port Already in Use

If ports 3230 or 6811 are already in use:

```bash
# Find and kill the process
lsof -ti:3230 | xargs kill -9
lsof -ti:6811 | xargs kill -9
```

### Demo Data Not Showing

1. Check the demo Convex is running: `docker ps | grep openclutch-convex-demo`
2. Verify the schema is deployed: `pnpm demo:deploy`
3. Re-seed the data: `pnpm demo:seed --clean`

### Cannot Connect to Convex

Make sure you're using `pnpm demo:dev` (not `pnpm dev`) which loads `.env.demo.local`.

### Demo Environment is Slow

The demo uses SQLite storage which is slower for large datasets. For better performance, the demo data is kept relatively small (~100 tasks, ~50 sessions).

## Data Retention

Demo data is stored in a Docker volume (`convex-demo-data`). It persists across container restarts but can be wiped:

```bash
# Remove all demo data
pnpm demo:reset

# Or manually:
docker compose -f docker-compose.demo.yml down -v
```

## Differences from Production

| Aspect | Production | Demo |
|--------|-----------|------|
| Convex Port | 3210 | 3230 |
| Dashboard Port | 3211 | 6811 |
| Work Loop | Enabled | Disabled |
| OpenClaw | Required | Required (same instance) |
| Data | Real projects | Generated demo data |
| Persistence | Permanent | Can be reset anytime |

## Contributing

When adding new features that need demo data:

1. Update `scripts/seed-demo.ts` to include the new data
2. Use deterministic generation (seeded RNG) for consistent screenshots
3. Add corresponding npm scripts if needed
4. Update this documentation
