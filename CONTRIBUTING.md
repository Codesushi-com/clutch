# Contributing to OpenClutch

Thank you for your interest in contributing! OpenClutch is an AI agent orchestration platform, and we welcome contributions that make it better.

## Welcome

We welcome contributions in these areas:

- **Bug fixes** — Found something broken? We'd love to know.
- **Features** — Have an idea? Open an issue first to discuss.
- **Documentation** — Typos, clarifications, examples — all help.
- **Tests** — More coverage is always good.

Not sure where to start? Check out issues labeled `good first issue`.

## Development Setup

### Prerequisites

- **Node.js 22** — [Volta](https://volta.sh) recommended: `volta install node@22`
- **pnpm 10+** — `npm install -g pnpm`
- **Convex** — Self-hosted via Docker or Convex Cloud
- **OpenClaw** — Separate service for agent execution ([repo](https://github.com/openclaw/openclaw))

### Installation

```bash
# Clone the repository
git clone https://github.com/OWNER/REPO.git
cd REPO

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your configuration

# Start development server
pnpm dev
```

The dev server runs on `http://localhost:3002`.

### Environment Configuration

Key variables in `.env.local`:

```bash
# OpenClaw connection (required for agent execution)
OPENCLAW_HTTP_URL=http://localhost:18789
OPENCLAW_TOKEN=<your-gateway-token>

# Convex (self-hosted example)
CONVEX_SELF_HOSTED_URL=http://localhost:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=<admin-key>
```

See [README.md](./README.md#configuration) for full details.

## Architecture Overview

OpenClutch runs as four coordinated processes:

| Process | Purpose |
|---------|---------|
| `clutch-server` | Next.js web UI & API (port 3002) |
| `clutch-loop` | Work loop orchestration engine |
| `clutch-bridge` | WebSocket bridge to OpenClaw |
| `clutch-session-watcher` | JSONL file monitor |

See [README.md](./README.md#architecture) for the full architecture diagram and data flow.

## Making Changes

### Git Worktrees (REQUIRED)

**Never switch branches in the main repo** — the dev server runs there on `main`. Switching branches kills it.

Use worktrees for all feature work:

```bash
# Create worktree
git worktree add /path/to/clutch-worktrees/feat/my-feature -b feat/my-feature
cd /path/to/clutch-worktrees/feat/my-feature

# Work and commit...

# After PR is merged, clean up
git worktree remove /path/to/clutch-worktrees/feat/my-feature
```

### Branch Naming

- `fix/<ticket-id>-<short-desc>` — Bug fixes
- `feat/<ticket-id>-<short-desc>` — New features
- `docs/<short-desc>` — Documentation changes

Examples:
- `fix/5ef119a3-contributing-docs`
- `feat/abc1234-new-dashboard`

## Code Style

We use:
- **TypeScript** — Strict mode enabled
- **React 19** — Latest patterns
- **Tailwind CSS v4** — Utility-first styling
- **pnpm** — Package manager (never npm)

ESLint and Prettier configs are in the repo. Run `pnpm lint` to check.

### Key Rules

**No relative imports** — Use absolute paths:
```typescript
// ❌ Bad
import { Button } from '../../components/ui/button';

// ✅ Good
import { Button } from '@/components/ui/button';
```

**Module imports preferred** — Import modules, not individual functions:
```typescript
// ❌ Bad
import { formatDate } from '@/lib/utils';

// ✅ Good
import * as utils from '@/lib/utils';
utils.formatDate(...);
```

**Let errors propagate** — Don't catch and swallow. Catch only at boundaries:
```typescript
// ❌ Bad
try {
  await riskyOperation();
} catch (e) {
  console.error(e);
  return null;
}

// ✅ Good
await riskyOperation(); // Let it throw, caller handles it
```

## Testing

All three must pass before submitting a PR:

```bash
# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## Pre-commit Hooks

Pre-commit hooks run lint and typecheck automatically.

**Never use `--no-verify`** — If hooks fail, fix the errors:

```bash
# See what's wrong
pnpm lint
pnpm typecheck

# Fix errors, then commit again
git add -A
git commit -m "feat: your change"
```

If a failure is in code you didn't touch, fix it anyway — leave the codebase cleaner than you found it.

## Pull Requests

- **One concern per PR** — Don't mix unrelated changes
- **Clear description** — What changed and why
- **Link issues** — Include `Fixes #123` or `Relates to #123`
- **Screenshots for UI changes** — Visual proof helps review

PRs require maintainer review before merging. Don't merge your own PRs.

### Branch Protection

Repository maintainers can enable branch protection rules on `main` to require CI checks to pass before merging. This ensures code quality and prevents broken builds from being merged. The CI workflow runs lint, typecheck, and test jobs on every PR and push to main.

## Code of Conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

---

Questions? Open an issue or start a discussion.
