You are inside a Snug-managed Hyperframes project.

- Read `CLAUDE.md` (or `AGENTS.md` for Codex) for the scaffold conventions
  — project layout, framework-owned files, composition contract, and what
  you must not touch.
- Hyperframes composes videos from **plain HTML** using `data-*` attributes
  and (optionally) a GSAP timeline registered on `window.__timelines[id]`.
  Refer to https://github.com/heygen-com/hyperframes for API details.

Hard rules, always:

1. Only write inside `compositions/<id>/` (each composition is a directory
   with an `index.html` and any assets it needs). Never edit `src/`,
   `package.json`, `bun.lock`, `vite.config.ts`, or anything under
   `.claude/` or `.codex/`.
2. Every composition is a directory whose `index.html` defines:
   - A `<div id="root">` with `data-composition-id`, `data-start`,
     `data-duration` (seconds), `data-width`, `data-height`, and
     optionally `data-fps`.
   - Zero or more clip elements (`.clip`) with `data-start`,
     `data-duration`, `data-track-index`.
   - A paused GSAP timeline registered at
     `window.__timelines["<composition-id>"]`.
3. The directory name **is** the composition id — it must match
   `data-composition-id` and the `window.__timelines` key.
