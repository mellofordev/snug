import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { CompositionFile, Framework, RenderHistoryItem, RenderProgress } from "@acme/contracts";
import { RENDER_SCRIPT } from "@acme/scaffold";

/**
 * `spawn` cannot execute paths inside `app.asar`. electron-builder mirrors unpacked
 * files under `app.asar.unpacked` (see `asarUnpack` in package.json).
 */
function resourcePathForExec(absPath: string): string {
  const needle = `${path.sep}app.asar${path.sep}`;
  if (!absPath.includes(needle)) return absPath;
  const candidate = absPath.replace(needle, `${path.sep}app.asar.unpacked${path.sep}`);
  return existsSync(candidate) ? candidate : absPath;
}

const resolvedRenderScript = resourcePathForExec(RENDER_SCRIPT);

/** Canonical scripts per framework (match the scaffold templates under `packages/scaffold/templates/<framework>/`). */
const DEFAULT_SCAFFOLD_SCRIPTS: Record<Framework, Record<"player" | "studio" | "render", string>> = {
  remotion: {
    player: "vite",
    studio: "remotion studio",
    render: "remotion render"
  },
  hyperframes: {
    player: "vite",
    studio: "hyperframes preview",
    render: "hyperframes render"
  }
};

/**
 * Detect the project's framework from its package.json dependencies. Used by
 * render/preview/list because the `Framework` is only recorded in the IPC at init
 * time — at run time we inspect the installed deps. Falls back to `"remotion"` so
 * existing projects (created before hyperframes support) keep working unchanged.
 */
function detectFramework(root: string): Framework {
  const pkgPath = path.join(root, "package.json");
  if (!existsSync(pkgPath)) return "remotion";
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    if (all["hyperframes"] || all["@hyperframes/player"]) return "hyperframes";
    return "remotion";
  } catch {
    return "remotion";
  }
}

// ── Template source (GitHub tarball) ────────────────────────────────────
// Fetched from the monorepo on project init — no API, no R2. Templates are
// pinned to an immutable git tag (not a branch) so each desktop release ships
// a reproducible scaffold and in-flight commits on `master` can't reach users.
// To ship a template change: cut a new `templates-vN` tag and bump
// `TEMPLATE_REF` in the next desktop release.
// The template for each framework lives at `packages/scaffold/templates/<framework>/`.
const TEMPLATE_REPO = "mellofordev/snug";
const TEMPLATE_REF = "templates-v2";
const TEMPLATES_ROOT = "packages/scaffold/templates";

function templateTarballUrl(): string {
  return `https://codeload.github.com/${TEMPLATE_REPO}/tar.gz/refs/tags/${TEMPLATE_REF}`;
}

function templateSubpath(framework: Framework): string {
  return `${TEMPLATES_ROOT}/${framework}`;
}

/**
 * GitHub codeload tarballs wrap everything in a top-level `<repo>-<ref>/` directory.
 * That prefix plus the template subpath must be stripped so only template contents
 * land at the project root.
 */
function templateStripComponents(framework: Framework): number {
  // "<repo>-<ref>" + each segment of the template subpath
  return 1 + templateSubpath(framework).split("/").filter(Boolean).length;
}

function tarballInternalPrefix(framework: Framework): string {
  const repoName = TEMPLATE_REPO.split("/").pop() ?? "snug";
  return `${repoName}-${TEMPLATE_REF}/${templateSubpath(framework)}`;
}

async function downloadTarball(url: string, destPath: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(
      "Could not reach GitHub to download the project template. Check your internet connection and try again."
    );
  }
  if (!res.ok || !res.body) {
    throw new Error(
      `GitHub returned ${res.status} when fetching the project template from ${url}.`
    );
  }
  await pipeline(Readable.fromWeb(res.body as unknown as import("node:stream/web").ReadableStream), createWriteStream(destPath));
}

async function extractTemplate(
  tarPath: string,
  projectRoot: string,
  framework: Framework
): Promise<void> {
  await fs.mkdir(projectRoot, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "tar",
      [
        "-xzf",
        tarPath,
        "-C",
        projectRoot,
        `--strip-components=${templateStripComponents(framework)}`,
        tarballInternalPrefix(framework)
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar extract failed (exit ${code})${stderr ? `:\n${stderr.trim()}` : ""}`));
    });
    child.on("error", (err) => {
      reject(new Error(`Failed to run tar: ${err.message}`));
    });
  });
}

/**
 * Skip fetch/copy/install when scaffold is already complete. Framework-agnostic —
 * different templates may lay files out differently, so we only check for a
 * package.json with a `player` script (required by every template).
 */
function shouldSkipProjectInit(root: string): boolean {
  const pkgPath = path.join(root, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: { player?: string } };
    return typeof pkg.scripts?.player === "string" && pkg.scripts.player.trim().length > 0;
  } catch {
    return false;
  }
}

async function runBunInstall(cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("bun", ["install"], {
      cwd,
      env: buildEnv(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else {
        const detail = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
        reject(
          new Error(
            detail
              ? `bun install failed (exit ${code}):\n${detail}`
              : `bun install failed (exit ${code})`
          )
        );
      }
    });
    child.on("error", (err) => {
      reject(new Error(`Failed to run bun install: ${err.message}`));
    });
  });
}

// Expand PATH for CLI tools
function buildEnv(): NodeJS.ProcessEnv {
  const extraPaths = [
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/opt/homebrew/bin",
    `${process.env.HOME}/.npm-global/bin`,
    `${process.env.HOME}/.local/bin`,
    `${process.env.HOME}/.bun/bin`,
    `${process.env.HOME}/.nvm/versions/node/current/bin`
  ].join(":");

  return {
    ...process.env,
    PATH: `${extraPaths}:${process.env.PATH ?? ""}`
  };
}

/** Normalize and validate project paths so preview/render never run against Electron's cwd by mistake. */
function resolveProjectRoot(dir: string): string {
  const trimmed = dir.trim();
  if (!trimmed) {
    throw new Error("Project directory is empty — open or create a project first.");
  }
  if (!path.isAbsolute(trimmed)) {
    throw new Error(`Project directory must be an absolute path, got: ${dir}`);
  }
  return path.resolve(trimmed);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ── Project Initialization ──────────────────────────────────────────────

export async function initProject(
  dir: string,
  framework: Framework
): Promise<{ success: boolean; error?: string }> {
  let root: string;
  try {
    root = resolveProjectRoot(dir);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Invalid project directory"
    };
  }

  const tarPath = path.join(os.tmpdir(), `snug-template-${randomUUID()}.tar.gz`);

  try {
    if (shouldSkipProjectInit(root)) {
      return { success: true };
    }

    await downloadTarball(templateTarballUrl(), tarPath);
    await extractTemplate(tarPath, root, framework);
    await fs.mkdir(path.join(root, "output"), { recursive: true });

    const pkgAfterCopy = path.join(root, "package.json");
    if (!existsSync(pkgAfterCopy)) {
      return {
        success: false,
        error:
          "Project scaffold did not produce package.json (internal error). Try again or contact support."
      };
    }

    await runBunInstall(root);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error during project init"
    };
  } finally {
    try {
      unlinkSync(tarPath);
    } catch {
      /* tarball may not exist if download failed early */
    }
  }
}

// ── Player Management ───────────────────────────────────────────────────
// Preview: `bun run player` in the project root with an explicit cwd (no shell script) so packaged
// Electron never runs Bun against the wrong directory. Lock reuse is handled here in TypeScript.

const LOCK_FILENAME = ".snug-player.lock";

function lockFilePath(dir: string): string {
  return path.join(dir, LOCK_FILENAME);
}

function parseLock(content: string): { pid: number; url: string } | null {
  const pid = parseInt((content.match(/^pid=(\d+)/m) ?? [])[1] ?? "", 10);
  const url = (content.match(/^url=(https?:\/\/.+)/m) ?? [])[1] ?? "";
  if (!isNaN(pid) && pid > 0 && url.startsWith("http")) return { pid, url };
  return null;
}

/** Strip ANSI escape sequences (Vite colors its Local: URL line). */
function stripAnsi(s: string): string {
  return s.replace(/\u001b\[[0-9;]*m/g, "");
}

/**
 * Find a dev-server URL in accumulated Vite output.
 * Must run on a buffer because the URL is often split across stdout chunks.
 */
const DEV_SERVER_URL =
  /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]|::1):\d+(?:\/[^\s]*)?/;

function extractDevServerUrl(buffer: string): string | null {
  const clean = stripAnsi(buffer);
  const m = clean.match(DEV_SERVER_URL);
  return m ? m[0].replace(/\/$/, "") : null;
}

/** If package.json is missing scaffold scripts (e.g. partial init), merge canonical defaults for the detected framework. */
function mergeDefaultScaffoldScripts(root: string): void {
  const pkgPath = path.join(root, "package.json");
  if (!existsSync(pkgPath)) return;

  let pkg: { scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
  } catch {
    return;
  }

  const defaults = DEFAULT_SCAFFOLD_SCRIPTS[detectFramework(root)];
  const keys = ["player", "studio", "render"] as const;
  let changed = false;
  pkg.scripts = pkg.scripts ?? {};
  for (const k of keys) {
    const v = defaults[k];
    if (v.trim() && !pkg.scripts[k]?.trim()) {
      pkg.scripts[k] = v;
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
}

/** Child processes started this session, keyed by project dir. */
const runningPlayers = new Map<string, ChildProcess>();

/**
 * Projects where preview is active (including lock-only "reuse" — no child in `runningPlayers`
 * after bash exits). Used so app quit / stop-all can kill Vite processes we did not spawn.
 */
const previewSessionDirs = new Set<string>();

function registerPreviewSession(dir: string): void {
  previewSessionDirs.add(dir);
}

/** Kill Vite for a project: spawned child (if any), then PID from `.snug-player.lock`, then unlink lock. */
function stopPlayerSync(dir: string): void {
  previewSessionDirs.delete(dir);
  const child = runningPlayers.get(dir);
  if (child) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    runningPlayers.delete(dir);
  }
  const lp = lockFilePath(dir);
  try {
    const content = readFileSync(lp, "utf8");
    const lock = parseLock(content);
    if (lock) {
      try {
        process.kill(lock.pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
    unlinkSync(lp);
  } catch {
    /* no lock */
  }
}

/**
 * Start the Vite dev server (`bun run player`) in `dir` with `cwd` set to the resolved project root.
 */
export async function startPlayer(dir: string): Promise<{ url: string }> {
  const root = resolveProjectRoot(dir);
  const pkgPath = path.join(root, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`Not a Snug project (no package.json): ${root}`);
  }

  mergeDefaultScaffoldScripts(root);

  let pkg: { scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
  } catch {
    throw new Error(`Invalid package.json in ${root}`);
  }
  if (!pkg.scripts?.player?.trim()) {
    throw new Error(
      `This project's package.json has no "player" script. Add "player": "vite" or re-create the project with the latest Snug scaffold.`
    );
  }

  const lockPath = lockFilePath(root);

  const existing = runningPlayers.get(root);
  if (existing) {
    existing.kill("SIGTERM");
    runningPlayers.delete(root);
  }

  try {
    const content = readFileSync(lockPath, "utf8");
    const lock = parseLock(content);
    if (lock && isProcessAlive(lock.pid)) {
      registerPreviewSession(root);
      return { url: lock.url };
    }
  } catch {
    /* no lock file */
  }
  try {
    unlinkSync(lockPath);
  } catch {
    /* no stale lock */
  }

  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["run", "player"], {
      cwd: root,
      env: buildEnv(),
      stdio: ["ignore", "pipe", "pipe"]
    });

    runningPlayers.set(root, child);
    let settled = false;
    let outBuf = "";
    let errBuf = "";

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      runningPlayers.delete(root);
      const tail = stripAnsi((outBuf + errBuf).slice(-4000));
      reject(
        new Error(
          tail.trim()
            ? `Player startup timed out. Last output:\n${tail}`
            : "Player startup timed out (no Vite URL in stdout/stderr)."
        )
      );
    }, 90_000);

    const settleErr = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(message));
    };

    function tryParseUrl(): void {
      const combined = outBuf + errBuf;
      const url = extractDevServerUrl(combined);
      if (!url || settled) return;
      const stillRunning =
        child.exitCode === null && child.signalCode === null && typeof child.pid === "number";
      if (!stillRunning) return;
      settled = true;
      clearTimeout(timeout);
      void fs.writeFile(lockPath, `pid=${child.pid}\nurl=${url}\n`).catch(() => {});
      registerPreviewSession(root);
      resolve({ url });
    }

    const onChunk = (chunk: Buffer, which: "out" | "err") => {
      const text = chunk.toString();
      if (which === "out") outBuf += text;
      else errBuf += text;
      if (outBuf.length > 256_000) outBuf = outBuf.slice(-128_000);
      if (errBuf.length > 256_000) errBuf = errBuf.slice(-128_000);
      tryParseUrl();
    };

    child.stdout?.on("data", (c) => onChunk(c, "out"));
    child.stderr?.on("data", (c) => onChunk(c, "err"));

    child.on("error", (err) => {
      runningPlayers.delete(root);
      settleErr(`Failed to start player: ${err.message}`);
    });

    child.on("close", (code) => {
      runningPlayers.delete(root);
      if (settled) return;
      const combined = outBuf + errBuf;
      const url = extractDevServerUrl(combined);
      if (code === 0 && url) {
        settled = true;
        clearTimeout(timeout);
        registerPreviewSession(root);
        resolve({ url });
        return;
      }
      void fs.unlink(lockPath).catch(() => {});
      const tail = stripAnsi(combined.slice(-4000));
      settleErr(
        tail.trim()
          ? `Player exited with code ${code}:\n${tail}`
          : `Player exited with code ${code}`
      );
    });
  });
}

export async function stopPlayer(dir: string): Promise<void> {
  try {
    stopPlayerSync(resolveProjectRoot(dir));
  } catch {
    /* invalid path on shutdown / race — nothing to stop */
  }
}

export function stopAllPlayers(): void {
  const dirs = [...new Set([...runningPlayers.keys(), ...previewSessionDirs])];
  for (const dir of dirs) {
    stopPlayerSync(dir);
  }
}

// ── Composition Listing ─────────────────────────────────────────────────

export async function listCompositions(dir: string): Promise<CompositionFile[]> {
  const root = resolveProjectRoot(dir);
  const compositionsDir = path.join(root, "compositions");
  const framework = detectFramework(root);
  try {
    const entries = await fs.readdir(compositionsDir, { withFileTypes: true });
    if (framework === "hyperframes") {
      // Each composition is a directory containing `index.html`.
      const results: CompositionFile[] = [];
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const indexPath = path.join(compositionsDir, e.name, "index.html");
        if (existsSync(indexPath)) {
          results.push({ name: e.name, path: indexPath });
        }
      }
      return results;
    }
    // Remotion: `compositions/<id>.tsx`.
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
      .map((e) => ({
        name: e.name.replace(".tsx", ""),
        path: path.join(compositionsDir, e.name)
      }));
  } catch {
    return [];
  }
}

export async function deleteComposition(
  dir: string,
  compositionId: string
): Promise<void> {
  const root = resolveProjectRoot(dir);
  const id = compositionId.trim();
  if (!id) {
    throw new Error("Invalid composition name.");
  }
  const framework = detectFramework(root);
  const files = await listCompositions(dir);
  const match = files.find((f) => f.name === id);
  if (!match) {
    throw new Error("Composition not found.");
  }
  const compositionsDir = path.resolve(path.join(root, "compositions"));
  // For hyperframes we remove the whole composition directory; for remotion just the .tsx file.
  const resolvedTarget = path.resolve(
    framework === "hyperframes" ? path.join(compositionsDir, id) : match.path
  );
  const relativeToCompositions = path.relative(compositionsDir, resolvedTarget);
  if (relativeToCompositions.startsWith("..") || path.isAbsolute(relativeToCompositions)) {
    throw new Error("Invalid composition path.");
  }
  try {
    if (framework === "hyperframes") {
      await fs.rm(resolvedTarget, { recursive: true, force: false });
    } else {
      await fs.unlink(resolvedTarget);
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error("Composition file not found.");
    }
    throw err;
  }
}

const MENTION_IGNORE_DIRS = new Set([
  "node_modules",
  "src",
  "system-prompt",
  "output",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".cache",
  ".turbo",
  ".remotion"
]);

const MENTION_MAX_FILES = 6000;

/**
 * Recursive relative POSIX paths from the project root for @-file mentions (excludes bulky trees).
 */
export async function listProjectFilesForMention(dir: string): Promise<string[]> {
  const root = resolveProjectRoot(dir);
  const out: string[] = [];

  async function walk(relDir: string): Promise<void> {
    if (out.length >= MENTION_MAX_FILES) return;
    const abs = relDir ? path.join(root, relDir) : root;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (out.length >= MENTION_MAX_FILES) return;
      const name = e.name;
      const rel = relDir ? `${relDir}/${name}` : name;
      const posix = rel.split(path.sep).join("/");
      if (e.isDirectory()) {
        if (MENTION_IGNORE_DIRS.has(name)) continue;
        await walk(rel);
      } else {
        out.push(posix);
      }
    }
  }

  await walk("");
  return out.sort((a, b) => a.localeCompare(b));
}

// ── Video Rendering ─────────────────────────────────────────────────────

export async function renderComposition(
  dir: string,
  compositionId: string,
  onProgress: (progress: RenderProgress) => void
): Promise<void> {
  const root = resolveProjectRoot(dir);
  // Determine next output number
  const outputDir = path.join(root, "output");
  await fs.mkdir(outputDir, { recursive: true });

  let nextNum = 1;
  try {
    const files = await fs.readdir(outputDir);
    const numbers = files
      .filter((f) => f.startsWith("snug-out-") && f.endsWith(".mp4"))
      .map((f) => {
        const match = f.match(/snug-out-(\d+)\.mp4/);
        return match?.[1] ? parseInt(match[1], 10) : 0;
      });
    if (numbers.length > 0) {
      nextNum = Math.max(...numbers) + 1;
    }
  } catch {
    // output dir might be empty
  }

  const outputFileName = `snug-out-${nextNum}.mp4`;
  const outputPath = path.join(outputDir, outputFileName);

  onProgress({ status: "rendering", progress: 0 });

  const framework = detectFramework(root);
  const child = spawn("bash", [resolvedRenderScript, root, compositionId, outputPath, framework], {
    env: buildEnv(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let renderLog = "";

  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    renderLog += text;
    // Remotion outputs progress like "(45%)" or "Rendering - 45% done"
    const match = text.match(/(\d+)%/);
    const pct = match?.[1];
    if (pct !== undefined) {
      onProgress({
        status: "rendering",
        progress: parseInt(pct, 10) / 100
      });
    }
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    renderLog += text;
    const match = text.match(/(\d+)%/);
    const pct = match?.[1];
    if (pct !== undefined) {
      onProgress({
        status: "rendering",
        progress: parseInt(pct, 10) / 100
      });
    }
  });

  child.on("close", (code) => {
    if (code === 0) {
      onProgress({
        status: "completed",
        progress: 1,
        outputPath
      });
    } else {
      const tail = renderLog.trim().slice(-2000);
      onProgress({
        status: "failed",
        progress: 0,
        error: tail
          ? `Render failed (exit ${code}):\n${tail}`
          : `Render failed with exit code ${code}`
      });
    }
  });

  child.on("error", (err) => {
    onProgress({
      status: "failed",
      progress: 0,
      error: `Render error: ${err.message}`
    });
  });
}

// ── Output History ──────────────────────────────────────────────────────

export async function listOutputs(dir: string): Promise<RenderHistoryItem[]> {
  const root = resolveProjectRoot(dir);
  const outputDir = path.join(root, "output");
  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    const items: RenderHistoryItem[] = [];

    for (const entry of entries) {
      if (entry.isFile() && entry.name.startsWith("snug-out-") && entry.name.endsWith(".mp4")) {
        const fullPath = path.join(outputDir, entry.name);
        const stat = await fs.stat(fullPath);
        items.push({
          name: entry.name,
          path: fullPath,
          createdAt: stat.birthtime.toISOString()
        });
      }
    }

    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

// ── Clipboard pasted images (composer) ─────────────────────────────────

const CLIPBOARD_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif"
};

const MAX_CLIPBOARD_IMAGE_BYTES = 25 * 1024 * 1024;

export async function writeClipboardAsset(
  dir: string,
  dataBase64: string,
  mimeType: string
): Promise<{ relativePath: string }> {
  const root = resolveProjectRoot(dir);
  const normalizedMime =
    mimeType
      .toLowerCase()
      .split(";")[0]
      ?.trim() ?? "image/png";
  const ext = CLIPBOARD_MIME_TO_EXT[normalizedMime] ?? "png";
  const relDir = ".snug/pasted";
  const outDir = path.join(root, relDir);
  await fs.mkdir(outDir, { recursive: true });
  const fileName = `${randomUUID()}.${ext}`;
  const fullPath = path.join(outDir, fileName);
  let buffer: Buffer;
  try {
    buffer = Buffer.from(dataBase64, "base64");
  } catch {
    throw new Error("Invalid base64 image data.");
  }
  if (buffer.length === 0) {
    throw new Error("Empty image data.");
  }
  if (buffer.length > MAX_CLIPBOARD_IMAGE_BYTES) {
    throw new Error("Image too large (max 25MB).");
  }
  await fs.writeFile(fullPath, buffer);
  return { relativePath: `${relDir}/${fileName}` };
}

// ── System Prompt ───────────────────────────────────────────────────────

export async function readSystemPrompt(dir: string): Promise<string> {
  const root = resolveProjectRoot(dir);
  const promptPath = path.join(root, "system-prompt", "prompt.md");
  try {
    return await fs.readFile(promptPath, "utf-8");
  } catch {
    return "";
  }
}
