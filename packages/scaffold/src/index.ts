import path from "node:path";

/** Absolute path to the `@acme/scaffold` package root (parent of `dist/` when running from build output). */
export const SCAFFOLD_PACKAGE_ROOT = path.resolve(__dirname, "..");

/** Directory containing template files to copy into a new project. */
export const TEMPLATE_DIR = path.join(SCAFFOLD_PACKAGE_ROOT, "template");

/** Bash script that copies the template and runs `bun install` in the target directory. */
export const INIT_SCRIPT = path.join(SCAFFOLD_PACKAGE_ROOT, "scripts", "init-project.sh");

/**
 * Optional CLI helper: same lock + `bun run player` flow as Snug’s main process (see desktop
 * `projectManager.startPlayer`). Kept for manual debugging; the app spawns Bun with `cwd` in TS.
 */
export const PLAYER_SCRIPT = path.join(SCAFFOLD_PACKAGE_ROOT, "scripts", "start-player.sh");

/** Bash script that runs `bun run render` in a project to export one composition to disk. */
export const RENDER_SCRIPT = path.join(SCAFFOLD_PACKAGE_ROOT, "scripts", "render-composition.sh");
