# Snug project — Hyperframes scaffold guide

This is a Hyperframes project scaffolded by Snug. Snug owns the framework
wiring (the Vite player, the render/preview scripts). You own the
compositions and any static assets they reference.

## Project layout

```
.
├── compositions/               ← authoring surface (edit these)
│   └── HelloWorld/
│       └── index.html          ← one composition per directory
├── output/                     ← rendered .mp4 files (gitignored)
├── src/
│   └── player/                 ← Vite-powered preview shown inside Snug
│       ├── App.tsx             ← framework-owned, do NOT edit
│       ├── index.html
│       ├── main.tsx
│       └── types.d.ts
├── system-prompt/
│   └── prompt.md               ← short system prompt injected by Snug
├── package.json                ← locked deps
├── tsconfig.json
└── vite.config.ts              ← Vite (player) config, framework-owned
```

## Framework vs. user code

- **Framework-owned (do not edit):** `src/`, `vite.config.ts`,
  `package.json`, `tsconfig.json`, `.claude/`, `.codex/`, `system-prompt/`.
- **Yours to edit:** `compositions/<id>/**` — the HTML composition and any
  assets it references (videos, images, audio) inside that directory.
- The Snug player uses `import.meta.glob("../../compositions/*/index.html")`
  to discover compositions automatically — there is no registry to update.
- `hyperframes render` reads each composition's `index.html` and the GSAP
  timeline registered on `window.__timelines["<id>"]`.

## Composition contract

Each composition is a directory under `compositions/` whose `index.html`
looks like:

```html
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #000; }
      #root { position: relative; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="MyVideo"
      data-start="0"
      data-duration="5"
      data-width="1920"
      data-height="1080"
      data-fps="30"
    >
      <!-- clips go here; each has class="clip" and data-start / data-duration / data-track-index -->
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      // Animate clips here.
      window.__timelines["MyVideo"] = tl;
    </script>
  </body>
</html>
```

Rules:

- **Directory name = composition id.** `compositions/Intro/index.html`
  registers as id `Intro`. The directory name, `data-composition-id`, and
  the `window.__timelines[...]` key **must all match**.
- **`#root` must have `id="root"`.** Hyperframes' CLI and player both
  discover the composition via this element.
- **`data-duration` is in seconds**, not frames. `data-fps` defaults to 30.
- **Clip elements** sit inside `#root`, carry `class="clip"` and
  `data-start` / `data-duration` / `data-track-index`.
- **GSAP timeline** must be paused and registered on
  `window.__timelines[id]` — the player/CLI drives it by seeking.
- **Assets** referenced via relative paths (`./poster.jpg`,
  `./bgm.mp3`) resolve against the composition's `index.html`. Put them
  inside the same `compositions/<id>/` directory.

## How Snug runs this project

- **Preview.** Snug starts `bun run player` (Vite at
  `.snug-player.lock`'s port) and embeds the resulting page as an iframe in
  the desktop app. `src/player/App.tsx` posts `{ source: "snug-player",
  type: "compositions" | "ready" | "compositionSelected" }` messages to the
  parent window, and reacts to `getCompositions` / `selectComposition`
  messages from Snug.
- **Render.** Snug invokes
  `bunx hyperframes render compositions/<id> --output output/snug-out-N.mp4`
  via `scripts/render-composition.sh`. Hyperframes renders the composition
  to MP4 and nothing else in the repo is touched.
- **System prompt.** On the first turn of a new agent session Snug reads
  `system-prompt/prompt.md` and passes it verbatim as the agent's system
  prompt.

## Requirements

- **Node.js ≥ 22** (Hyperframes CLI requirement).
- **FFmpeg** available on PATH (Hyperframes shells out for encoding).
- Chrome is downloaded automatically by Hyperframes on first render.

## What the agent must not do

- Do not edit anything under `src/`, `vite.config.ts`, `package.json`,
  `bun.lock`, or `tsconfig.json`.
- Do not add dependencies — only what's already installed is available.
- Do not write files outside `compositions/<id>/`.
- Do not rename the directory-name → composition-id mapping.
