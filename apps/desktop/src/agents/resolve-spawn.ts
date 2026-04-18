import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Electron `spawn()` does not use a shell. For `#!/usr/bin/env node` shims, the kernel
 * looks up `node` on a minimal PATH, often causing ENOENT even when `which codex` works.
 * Resolve to `[interpreter, scriptPath, ...cliArgs]` when the target is an interpreted script.
 */
const resolvedLeadByRealPath = new Map<string, { file: string; leadArgs: string[] }>();

function peekShebangFirstLine(scriptPath: string): string | null {
  let fd: number;
  try {
    fd = fs.openSync(scriptPath, "r");
  } catch {
    return null;
  }
  try {
    const buf = Buffer.alloc(256);
    const bytesRead = fs.readSync(fd, buf, 0, 256, 0);
    const head = buf.subarray(0, bytesRead).toString("utf8");
    const line = head.split(/\r?\n/)[0] ?? "";
    return line.startsWith("#!") ? line : null;
  } finally {
    fs.closeSync(fd);
  }
}

function analyzeScriptInterpreter(scriptPath: string, env: NodeJS.ProcessEnv): { file: string; leadArgs: string[] } {
  const shebangLine = peekShebangFirstLine(scriptPath);
  if (!shebangLine) {
    return { file: scriptPath, leadArgs: [] };
  }

  const rest = shebangLine.slice(2).trim();
  if (!rest) {
    return { file: scriptPath, leadArgs: [] };
  }

  const tokens = rest.split(/\s+/).filter(Boolean);
  const [envOrInterp, cmdName] = tokens;
  if (
    tokens.length >= 2 &&
    envOrInterp &&
    cmdName &&
    (envOrInterp.endsWith("/env") || envOrInterp === "env")
  ) {
    try {
      const interpreter = execFileSync("which", [cmdName], { env, encoding: "utf8" }).trim();
      if (interpreter) {
        return { file: interpreter, leadArgs: [scriptPath] };
      }
    } catch {
      // fall through — try direct exec of script (usually still fails)
    }
  } else if (envOrInterp?.startsWith("/")) {
    return { file: envOrInterp, leadArgs: [scriptPath] };
  }

  return { file: scriptPath, leadArgs: [] };
}

export function resolveSpawnCommand(
  binaryPath: string,
  cliArgs: string[],
  env: NodeJS.ProcessEnv
): { file: string; args: string[] } {
  let probe = binaryPath;
  let real: string;
  try {
    real = fs.realpathSync(probe);
  } catch {
    if (!path.isAbsolute(binaryPath)) {
      try {
        probe = execFileSync("which", [binaryPath], { env, encoding: "utf8" }).trim();
        real = fs.realpathSync(probe);
      } catch {
        return { file: binaryPath, args: cliArgs };
      }
    } else {
      return { file: binaryPath, args: cliArgs };
    }
  }

  const hit = resolvedLeadByRealPath.get(real);
  if (hit) {
    return { file: hit.file, args: [...hit.leadArgs, ...cliArgs] };
  }

  const resolved = analyzeScriptInterpreter(real, env);
  resolvedLeadByRealPath.set(real, { file: resolved.file, leadArgs: resolved.leadArgs });
  return { file: resolved.file, args: [...resolved.leadArgs, ...cliArgs] };
}
