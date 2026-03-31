#!/usr/bin/env node
/**
 * macOS DMG using the same staging model as T3 Code’s desktop artifact script:
 * https://github.com/pingdotgg/t3code/blob/main/scripts/build-desktop-artifact.ts
 *
 * 1. Copy dist output + vendored workspace packages into a temp directory.
 * 2. Write a synthetic package.json with `file:./vendor/...` deps (no workspace symlinks).
 * 3. `bun install --production` so transitive deps (e.g. zod) resolve like a normal app.
 * 4. Run `electron-builder` from the stage root with a **pinned** `electron` version (see
 *    `resolvePinnedElectronVersion`) because production install skips the `electron` package.
 *
 * Run from repo root after `bun run build`:
 *   node scripts/build-desktop-dmg.mjs
 *
 * Code signing: install your Developer ID Application .cer (Keychain) so it pairs with the
 * private key from your CSR. By default electron-builder auto-discovers the identity. To force
 * an unsigned DMG (e.g. CI without certs), set SNUG_NO_CODESIGN=1.
 * Optional: CSC_NAME="Developer ID Application: Your Name (TEAMID)" if you have several identities.
 *
 * Set SNUG_KEEP_PACK_STAGE=1 to leave the temp stage on disk for debugging.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const desktopRoot = path.join(repoRoot, "apps", "desktop");
const rendererDist = path.join(repoRoot, "apps", "renderer", "dist");
const electronDist = path.join(desktopRoot, "dist-electron");
const releaseDir = path.join(desktopRoot, "release");
const keepStage = process.env.SNUG_KEEP_PACK_STAGE === "1";

const desktopPkg = JSON.parse(fs.readFileSync(path.join(desktopRoot, "package.json"), "utf8"));

/**
 * electron-builder refuses caret ranges when `electron` is not in node_modules (e.g. after
 * `bun install --production`). Use the exact version from the monorepo install.
 * @see https://github.com/electron-userland/electron-builder/issues/3984#issuecomment-504968246
 */
function resolvePinnedElectronVersion() {
  const candidates = [
    path.join(desktopRoot, "node_modules", "electron", "package.json"),
    path.join(repoRoot, "node_modules", "electron", "package.json")
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const v = JSON.parse(fs.readFileSync(p, "utf8")).version;
      if (typeof v === "string" && /^\d+\.\d+\.\d+/.test(v)) return v;
    }
  }
  const spec = desktopPkg.devDependencies?.electron ?? "33.3.0";
  const m = String(spec).match(/(\d+\.\d+\.\d+)/);
  if (m) return m[1];
  throw new Error(
    "Could not pin electron version: install deps (`bun install`) or set apps/desktop devDependencies.electron to a semver range."
  );
}

function skipName(name) {
  return name === "node_modules" || name === ".turbo";
}

function copyFiltered(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (skipName(path.basename(src))) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
      if (skipName(ent.name)) continue;
      copyFiltered(path.join(src, ent.name), path.join(dest, ent.name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

for (const [label, p] of Object.entries({ electronDist, rendererDist })) {
  if (!fs.existsSync(p)) {
    console.error(`Missing ${label}: ${p}\nRun \`bun run build\` from the repo root first.`);
    process.exit(1);
  }
}

const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "snug-desktop-stage-"));
const appDesktop = path.join(stageRoot, "apps", "desktop");

try {
  fs.mkdirSync(path.join(appDesktop, "dist-electron"), { recursive: true });
  fs.mkdirSync(path.join(appDesktop, "bundled-renderer"), { recursive: true });
  fs.mkdirSync(path.join(appDesktop, "resources"), { recursive: true });
  fs.mkdirSync(path.join(appDesktop, "assets"), { recursive: true });

  fs.cpSync(electronDist, path.join(appDesktop, "dist-electron"), { recursive: true });
  fs.cpSync(rendererDist, path.join(appDesktop, "bundled-renderer"), { recursive: true });
  fs.cpSync(path.join(desktopRoot, "assets"), path.join(appDesktop, "assets"), { recursive: true });
  fs.copyFileSync(
    path.join(desktopRoot, "assets", "icon.png"),
    path.join(appDesktop, "resources", "icon.png")
  );

  copyFiltered(path.join(repoRoot, "packages", "contracts"), path.join(stageRoot, "vendor", "contracts"));
  copyFiltered(path.join(repoRoot, "packages", "scaffold"), path.join(stageRoot, "vendor", "scaffold"));

  const electronVersion = resolvePinnedElectronVersion();

  const baseBuild = { ...(desktopPkg.build ?? {}) };
  baseBuild.electronVersion = electronVersion;
  baseBuild.directories = {
    ...(baseBuild.directories ?? {}),
    output: "dist",
    buildResources: "apps/desktop/resources"
  };
  baseBuild.mac = { ...(baseBuild.mac ?? {}), icon: "icon.png" };

  const stagePkg = {
    name: "snug-desktop-staged",
    version: desktopPkg.version,
    private: true,
    description: desktopPkg.description ?? "Snug",
    author: desktopPkg.author ?? "Snug",
    main: "apps/desktop/dist-electron/main.js",
    dependencies: {
      "@acme/contracts": "file:./vendor/contracts",
      "@acme/scaffold": "file:./vendor/scaffold"
    },
    devDependencies: {
      electron: electronVersion,
      "electron-builder": desktopPkg.devDependencies["electron-builder"]
    },
    build: {
      ...baseBuild,
      extraMetadata: { main: "apps/desktop/dist-electron/main.js" }
    }
  };

  fs.writeFileSync(path.join(stageRoot, "package.json"), `${JSON.stringify(stagePkg, null, 2)}\n`);

  console.log("[snug pack] Stage:", stageRoot);
  run("bun", ["install", "--production"], { cwd: stageRoot });

  const env = { ...process.env };
  if (process.env.SNUG_NO_CODESIGN === "1") {
    env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  }
  run("bunx", ["electron-builder", "--mac", "dmg", "--publish", "never"], { cwd: stageRoot, env });

  const stageDist = path.join(stageRoot, "dist");
  if (!fs.existsSync(stageDist)) {
    console.error("[snug pack] No dist output at", stageDist);
    process.exit(1);
  }

  fs.mkdirSync(releaseDir, { recursive: true });
  for (const name of fs.readdirSync(stageDist)) {
    const from = path.join(stageDist, name);
    if (!fs.statSync(from).isFile()) continue;
    const to = path.join(releaseDir, name);
    fs.copyFileSync(from, to);
    console.log("[snug pack] ->", to);
  }
} finally {
  if (keepStage) {
    console.log("[snug pack] SNUG_KEEP_PACK_STAGE=1 — left stage at", stageRoot);
  } else {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}
