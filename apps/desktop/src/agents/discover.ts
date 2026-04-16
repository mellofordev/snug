import fs from "node:fs";
import path from "node:path";

/**
 * Locate an executable without invoking `/usr/bin/which`, using the same `PATH` Snug passes
 * to agents plus common install locations (Bun, local bin, npm-global).
 */
export function locateExecutable(command: string, env: NodeJS.ProcessEnv): string | null {
  const home = env.HOME ?? env.USERPROFILE ?? "";
  const pathKey = process.platform === "win32" ? "Path" : "PATH";
  const rawPath = env[pathKey] ?? env.PATH ?? "";
  const fromPath = rawPath.split(path.delimiter).filter(Boolean);
  const wellKnown =
    home === ""
      ? []
      : [
          path.join(home, ".bun", "bin"),
          path.join(home, ".local", "bin"),
          path.join(home, ".npm-global", "bin"),
          path.join(home, "bin")
        ];

  const dirs = uniqueDirsFirst([...wellKnown, ...fromPath]);

  const names =
    process.platform === "win32" ? [command, `${command}.cmd`, `${command}.exe`] : [command];

  for (const dir of dirs) {
    for (const name of names) {
      const full = path.join(dir, name);
      let st: fs.Stats;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (!st.isFile() && !st.isSymbolicLink()) {
        continue;
      }
      if (canExecute(full)) {
        return full;
      }
    }
  }

  return null;
}

function uniqueDirsFirst(dirs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of dirs) {
    if (!d || seen.has(d)) {
      continue;
    }
    seen.add(d);
    out.push(d);
  }
  return out;
}

function canExecute(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return process.platform === "win32";
  }
}
