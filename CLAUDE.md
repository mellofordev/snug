# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start full dev environment (builds contracts first, then starts Vite + Electron in parallel)
bun run dev

# Build all packages
bun run build

# Build only the contracts package (required before typecheck if contracts changed)
bun run build:contracts

# Typecheck all packages
bun run typecheck
```

The dev startup sequence matters: `dev-electron.mjs` waits for the Vite server on port 5173 **and** for `dist-electron/main.js` and `dist-electron/preload.js` to exist before launching Electron. If Electron doesn't start, one of those three resources isn't ready yet.

## Architecture

This is a Bun + Turborepo monorepo with four workspace packages:

```
packages/contracts/   — shared Zod schemas + TypeScript types + IPC channel constants
packages/scaffold/    — Remotion project template on disk + scripts/init-project.sh (used when creating a new project)
apps/desktop/         — Electron main process + preload script
apps/renderer/        — React + Vite + Tailwind UI (runs in Electron's renderer)
```

### Data flow

```
Renderer (React)
  └─ window.nativeApi.*        (typed via NativeApi interface in contracts)
       └─ contextBridge        (preload.ts — thin IPC wrapper, no logic)
            └─ ipcMain.handle  (main.ts — validates with Zod, delegates to modules)
                 ├─ agentManager.ts   — spawns claude CLI, streams output
                 ├─ projectManager.ts — Remotion player/render + runs scaffold init (bash) for new projects
                 └─ settingsStore.ts  — persists JSON to userData/settings.json
```

New projects: `project:init` runs `packages/scaffold/scripts/init-project.sh`, which copies `packages/scaffold/template/` into the target directory and runs `bun install`. The desktop bundle **externalizes** `@acme/scaffold` (`--external @acme/scaffold` in tsup) so template paths resolve correctly at runtime.

### Key contracts conventions

- `packages/contracts/src/ipc.ts` is the single source of truth for IPC channel names and the `NativeApi` interface. Any new IPC call must be added here, in `ipcChannels.ts` (desktop), and in `preload.ts`.
- The contracts package is built to `dist/` and consumed as a compiled package. After changing contracts, run `bun run build:contracts` before typechecking other packages.
- `window.nativeApi` type is declared globally in `apps/renderer/src/vite-env.d.ts`.

### Agent orchestration

`agentManager.ts` spawns CLI agents using `spawn` (not `execFile`) with `stdio: ['pipe', 'pipe', 'pipe']`. The prompt is written to **stdin** and the process is started with `-p --dangerously-skip-permissions`. Output streams from stdout/stderr are forwarded in real-time to the renderer via `mainWindow.webContents.send(IPC_CHANNELS.promptOutput, ...)`. The resolved binary path from `which` is cached at detection time and reused at run time to avoid PATH issues in the Electron process environment.

### Settings persistence

`SettingsStore` (desktop) persists to `app.getPath("userData")/settings.json`. Currently stores:
- `baseDirectory` — root folder where new projects are created
- `lastOpenedDirectory` — restored as the active working directory on next launch

### Remotion

User projects created from the scaffold include `remotion`, `@remotion/cli`, and `@remotion/player` locally; the Snug UI embeds each project’s Vite player via a `webview` for preview and can trigger `remotion render` from the main process.
