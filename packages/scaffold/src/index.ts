import path from "node:path";

/** Absolute path to the `@acme/scaffold` package root (parent of `dist/` when running from build output). */
export const SCAFFOLD_PACKAGE_ROOT = path.resolve(__dirname, "..");

/** Directory containing template files to copy into a new project. */
export const TEMPLATE_DIR = path.join(SCAFFOLD_PACKAGE_ROOT, "template");

/** Bash script that copies the template and runs `bun install` in the target directory. */
export const INIT_SCRIPT = path.join(SCAFFOLD_PACKAGE_ROOT, "scripts", "init-project.sh");

/**
 * Bash script that starts the Remotion Vite player for a project.
 * Uses a lock file (.snug-player.lock) so re-running it reuses an existing server.
 * Prints the player URL to stdout on success.
 */
export const PLAYER_SCRIPT = path.join(SCAFFOLD_PACKAGE_ROOT, "scripts", "start-player.sh");
