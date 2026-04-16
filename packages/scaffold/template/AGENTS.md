# Snug project — scaffold guide (Codex)

This is a Remotion project scaffolded by Snug. Snug owns the framework
wiring (root registration, the Vite player, the render/preview scripts).
You own the compositions and any static assets they reference.

For Remotion API guidance (animations, transitions, captions, audio,
FFmpeg, fonts, Lottie, 3D, etc.) consult the vendored skill at
`.codex/skills/remotion-best-practices/SKILL.md` and its `rules/*.md`
entries. This file only documents the Snug-scaffold pieces around it.

## Project layout

```
.
├── compositions/             ← authoring surface (edit these)
│   └── HelloWorld.tsx
├── public/                   ← optional static assets, referenced via staticFile()
├── output/                   ← rendered .mp4 files (gitignored)
├── src/                      ← framework-owned, do NOT edit
│   ├── Root.tsx              ← Remotion CLI entry (require.context → compositions/)
│   ├── index.ts
│   └── player/               ← Vite-powered preview shown inside Snug
│       ├── App.tsx
│       ├── index.html
│       └── main.tsx
├── system-prompt/
│   └── prompt.md             ← short system prompt injected by Snug on the first turn
├── .claude/skills/remotion-best-practices/   ← vendored Remotion agent skill
├── .codex/skills/remotion-best-practices/    ← same skill, for Codex
├── remotion.config.ts        ← Remotion CLI config, framework-owned
├── vite.config.ts            ← Vite (player) config, framework-owned
├── package.json              ← locked deps; bun.lock ships pre-resolved
├── tsconfig.json
└── bun.lock
```

## Framework vs. user code

- **Framework-owned (do not edit):** `src/`, `remotion.config.ts`,
  `vite.config.ts`, `package.json`, `bun.lock`, `tsconfig.json`,
  `.claude/`, `.codex/`, `system-prompt/`.
- **Yours to edit:** `compositions/*.tsx` and (optionally) `public/` assets.
- `src/Root.tsx` uses `require.context("../compositions", false, /\.tsx$/)`
  for the Remotion CLI bundle; `src/player/App.tsx` uses
  `import.meta.glob("../../compositions/*.tsx", { eager: true })` for the
  Vite preview. Both discover compositions automatically — there is no
  registry to update.

## Composition contract

Each file in `compositions/` must follow this shape:

```tsx
import { AbsoluteFill, useCurrentFrame } from "remotion";

export const fps = 30;                // optional, default 30
export const durationInFrames = 150;  // optional, default 150
export const width = 1920;            // optional, default 1920
export const height = 1080;           // optional, default 1080

export default function MyVideo() {
  const frame = useCurrentFrame();
  return <AbsoluteFill>{/* ... */}</AbsoluteFill>;
}
```

Rules:

- **File name = composition id.** `compositions/Intro.tsx` registers as id
  `Intro` in both the Remotion CLI and the Vite player. Don't rename inside
  the file — the filename is authoritative.
- **Default export = the React component.** No other export slots are
  read by either discovery path.
- **`fps`, `durationInFrames`, `width`, `height`** are the only recognised
  metadata exports. Missing values fall back to `30 / 150 / 1920 / 1080`.
- **Imports allowed:** `react`, `remotion`, `@remotion/player` (the player
  only — the CLI bundle does not need it). Nothing else is installed; do
  not add dependencies to `package.json`.

## How Snug runs this project

- **Preview.** Snug starts `bun run player` (Vite) and embeds the resulting
  page as an iframe. `src/player/App.tsx` posts `{ source: "snug-player",
  type: "compositions" | "ready" | "compositionSelected" }` messages to the
  parent window, and reacts to `getCompositions` / `selectComposition`
  messages from Snug.
- **Render.** Snug invokes `bun run render <id>` via
  `scripts/render-composition.sh`; output lands in `output/snug-out-N.mp4`.
  Nothing else in the repo is touched.

## What the agent must not do

- Do not edit anything under `src/`, `remotion.config.ts`,
  `vite.config.ts`, `package.json`, `bun.lock`, or `tsconfig.json`.
- Do not add dependencies — only `react` and `remotion` (+ `@remotion/*`
  already present) are available at install time.
- Do not write files outside `compositions/` and `public/`.
- Do not rename the file-name → composition-id mapping, and do not register
  compositions by hand in `Root.tsx`.
- Do not modify `.claude/`, `.codex/`, or the vendored skill content; it's
  refreshed by Snug's maintainer script.
