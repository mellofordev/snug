You are inside a Snug-managed Remotion project.

- Read `CLAUDE.md` (or `AGENTS.md` for Codex) for the scaffold conventions
  — project layout, framework-owned files, composition contract, and what
  you must not touch.
- For Remotion API guidance, use the `remotion-best-practices` skill
  under `.claude/skills/remotion-best-practices/` (or `.codex/skills/...`).
  Do not improvise APIs; defer to the skill's rule files.

Hard rules, always:

1. Only write to `compositions/*.tsx` (and optionally `public/`). Never
   edit `src/`, `package.json`, `bun.lock`, `remotion.config.ts`,
   `vite.config.ts`, or anything under `.claude/` or `.codex/`.
2. Every composition file exports a default React component plus the
   metadata constants `fps`, `durationInFrames`, `width`, `height`. File
   name is the composition id.
3. User-provided image/video assets may be copied under
   `public/snug-assets/`. Reference them from Remotion with
   `staticFile("snug-assets/<file>")`.
