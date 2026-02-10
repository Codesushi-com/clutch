# Contributing to OpenClutch

Thank you for your interest in contributing to OpenClutch!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/clutch.git`
3. Follow the [Quick Start](./README.md#quick-start) guide to set up your development environment

## Development Workflow

### Branching

Use git worktrees for feature development:

```bash
git worktree add ../clutch-worktrees/fix/my-feature -b fix/my-feature
cd ../clutch-worktrees/fix/my-feature
```

### Commit Messages

Follow conventional commits:

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `refactor:` — Code refactoring
- `test:` — Adding tests
- `chore:` — Maintenance tasks

### Before Submitting

1. Run type checks: `pnpm typecheck`
2. Run linter: `pnpm lint`
3. Run tests: `pnpm test`
4. Ensure pre-commit hooks pass (never use `--no-verify`)

## Code Style

- **No relative imports** — use absolute paths
- **Module imports** — prefer `import * as module` over named imports
- **Error handling** — let errors propagate, catch only at boundaries
- **TypeScript** — strict mode enabled

## Pull Request Process

1. Update documentation for any changed functionality
2. Ensure all CI checks pass
3. Request review from maintainers
4. Address review feedback

## Questions?

Open an issue or join the discussion in our community channels.
