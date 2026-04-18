import path from "node:path";

/** Absolute path to the `@acme/scaffold` package root (parent of `dist/` when running from build output). */
export const SCAFFOLD_PACKAGE_ROOT = path.resolve(__dirname, "..");

/** Bash script that runs `bun run render` in a project to export one composition to disk. */
export const RENDER_SCRIPT = path.join(SCAFFOLD_PACKAGE_ROOT, "scripts", "render-composition.sh");
