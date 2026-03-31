# Snug

A macOS desktop app that lets you create videos with [Remotion](https://remotion.dev) using natural language, powered by [Claude Code](https://claude.ai/code).

Describe what you want, and Snug handles the rest — scaffolding a Remotion project, writing the code, and previewing the result — all without leaving the app.

## Install

Download the latest `.dmg` from the [Releases](https://github.com/mellofordev/snug/releases/latest) page.





## Prerequisites

Snug spawns [Claude Code](https://docs.anthropic.com/en/docs/claude-code) under the hood. You need:

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/getting-started) installed and authenticated
- [Bun](https://bun.sh) installed (used for project scaffolding and Remotion)

## Development

```bash
# Install dependencies
bun install

# Start the dev environment (Vite + Electron)
bun run dev

# Typecheck all packages
bun run typecheck

# Build macOS .dmg
bun run dist:mac
```

## License

MIT
