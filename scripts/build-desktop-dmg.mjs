#!/usr/bin/env node
/**
 * macOS DMG build — staging model inspired by T3 Code.
 *
 * Pipeline:
 *   1. Stage temp dir with vendored workspace deps
 *   2. electron-builder signs the .app (notarize: false — @electron/notarize hangs on local builds)
 *   3. xcrun notarytool submit --wait (stdio: inherit — you see real-time progress)
 *   4. xcrun stapler staple on .app + rebuilt DMG
 *   5. Rebuild update zip + latest-mac.yml for electron-updater
 *
 * Why not @electron/notarize? It pipes stdout/stderr to a buffer (no terminal output),
 * so when notarytool hangs or prompts, you see nothing. Running xcrun directly with
 * stdio: inherit gives full visibility.
 *
 * Env vars (.env at repo root):
 *   APPLE_ID                      — your Apple ID email
 *   APPLE_APP_SPECIFIC_PASSWORD   — app-specific password (appleid.apple.com)
 *   APPLE_TEAM_ID                 — 10-char team ID (developer.apple.com)
 *
 * Flags:
 *   SNUG_NO_CODESIGN=1            — skip signing entirely (unsigned build)
 *   SNUG_ALLOW_UNNOTARIZED=1      — sign but skip notarization
 *   SNUG_KEEP_PACK_STAGE=1        — keep temp staging dir for debugging
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

// ── Load .env ───────────────────────────────────────────────────────────
try {
  const envPath = path.join(repoRoot, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const match = line.match(/^\s*([\w]+)\s*=\s*(.+?)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
} catch { /* ignore */ }

// ── Paths & flags ───────────────────────────────────────────────────────
const desktopRoot = path.join(repoRoot, "apps", "desktop");
const rendererDist = path.join(repoRoot, "apps", "renderer", "dist");
const electronDist = path.join(desktopRoot, "dist-electron");
const releaseDir = path.join(desktopRoot, "release");
const keepStage = process.env.SNUG_KEEP_PACK_STAGE === "1";
const noCodesign = process.env.SNUG_NO_CODESIGN === "1";
const allowUnnotarized = process.env.SNUG_ALLOW_UNNOTARIZED === "1";

const desktopPkg = JSON.parse(fs.readFileSync(path.join(desktopRoot, "package.json"), "utf8"));
const productName = desktopPkg.build?.productName ?? "Snug";

// ── Pre-flight ──────────────────────────────────────────────────────────

function getApplePassword() {
  return process.env.APPLE_APP_SPECIFIC_PASSWORD || process.env.APPLE_ID_PASSWORD || "";
}

function hasAppleCreds() {
  return Boolean(process.env.APPLE_ID && getApplePassword() && process.env.APPLE_TEAM_ID);
}

const shouldNotarize = !noCodesign && !allowUnnotarized && hasAppleCreds();

if (!noCodesign && !allowUnnotarized && !hasAppleCreds()) {
  console.error(`
[snug pack] Missing Apple notarization env vars.

Add to repo root .env:
  APPLE_ID=your@appleid.email
  APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
  APPLE_TEAM_ID=XXXXXXXXXX

Or for local-only builds:
  SNUG_NO_CODESIGN=1           — unsigned
  SNUG_ALLOW_UNNOTARIZED=1     — signed but skip notarization
`);
  process.exit(1);
}

for (const [label, p] of Object.entries({ electronDist, rendererDist })) {
  if (!fs.existsSync(p)) {
    console.error(`Missing ${label}: ${p}\nRun \`bun run build\` first.`);
    process.exit(1);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  console.log(`[snug pack] $ ${cmd} ${args.filter(a => !a.includes(getApplePassword())).join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    console.error(`[snug pack] Command failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

function runCapture(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}

function resolvePinnedElectronVersion() {
  for (const p of [
    path.join(desktopRoot, "node_modules", "electron", "package.json"),
    path.join(repoRoot, "node_modules", "electron", "package.json")
  ]) {
    if (fs.existsSync(p)) {
      const v = JSON.parse(fs.readFileSync(p, "utf8")).version;
      if (typeof v === "string" && /^\d+\.\d+\.\d+/.test(v)) return v;
    }
  }
  const m = String(desktopPkg.devDependencies?.electron ?? "33.3.0").match(/(\d+\.\d+\.\d+)/);
  if (m) return m[1];
  throw new Error("Could not pin electron version.");
}

function stagePackDependencies() {
  const out = { "@acme/contracts": "file:./vendor/contracts", "@acme/scaffold": "file:./vendor/scaffold" };
  for (const [name, spec] of Object.entries(desktopPkg.dependencies ?? {})) {
    if (name === "@acme/contracts" || name === "@acme/scaffold") continue;
    if (typeof spec === "string" && spec.startsWith("workspace:")) {
      throw new Error(`[snug pack] ${name} uses workspace:* — add a vendor mapping.`);
    }
    out[name] = spec;
  }
  return out;
}

function copyFiltered(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    const base = path.basename(src);
    if (base === "node_modules" || base === ".turbo") return;
    fs.mkdirSync(dest, { recursive: true });
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name === ".turbo") continue;
      copyFiltered(path.join(src, ent.name), path.join(dest, ent.name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function findBuiltMacApp(distRoot) {
  const appBundle = `${productName}.app`;
  for (const dir of ["mac-arm64", "mac-x64", "mac"]) {
    const p = path.join(distRoot, dir, appBundle);
    if (fs.existsSync(p)) return p;
  }
  if (!fs.existsSync(distRoot)) return null;
  for (const ent of fs.readdirSync(distRoot, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const p = path.join(distRoot, ent.name, appBundle);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function writeLatestMacYml(distDir, zipPath, version) {
  const zipName = path.basename(zipPath);
  const buf = fs.readFileSync(zipPath);
  const sha512 = createHash("sha512").update(buf).digest("base64");
  const yml =
    `version: ${version}\nfiles:\n  - url: ${zipName}\n    sha512: ${sha512}\n    size: ${buf.length}\n` +
    `path: ${zipName}\nsha512: ${sha512}\nreleaseDate: '${new Date().toISOString()}'\n`;
  fs.writeFileSync(path.join(distDir, "latest-mac.yml"), yml, "utf8");
  const blockmap = path.join(distDir, `${zipName}.blockmap`);
  if (fs.existsSync(blockmap)) fs.unlinkSync(blockmap);
  console.log(`[snug pack] Wrote latest-mac.yml`);
}

// ── Stage & Build ───────────────────────────────────────────────────────

const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "snug-desktop-stage-"));
const appDesktop = path.join(stageRoot, "apps", "desktop");

try {
  for (const dir of ["dist-electron", "bundled-renderer", "resources", "assets"]) {
    fs.mkdirSync(path.join(appDesktop, dir), { recursive: true });
  }
  fs.cpSync(electronDist, path.join(appDesktop, "dist-electron"), { recursive: true });
  fs.cpSync(rendererDist, path.join(appDesktop, "bundled-renderer"), { recursive: true });
  fs.cpSync(path.join(desktopRoot, "assets"), path.join(appDesktop, "assets"), { recursive: true });
  fs.copyFileSync(path.join(desktopRoot, "assets", "icon.png"), path.join(appDesktop, "resources", "icon.png"));

  copyFiltered(path.join(repoRoot, "packages", "contracts"), path.join(stageRoot, "vendor", "contracts"));
  copyFiltered(path.join(repoRoot, "packages", "scaffold"), path.join(stageRoot, "vendor", "scaffold"));

  const electronVersion = resolvePinnedElectronVersion();

  // ── electron-builder config ───────────────────────────────────────
  // notarize: false — we run xcrun notarytool ourselves (see below).
  const buildConfig = {
    appId: desktopPkg.build?.appId ?? "com.snug.desktop",
    productName,
    asar: true,
    asarUnpack: desktopPkg.build?.asarUnpack ?? ["**/node_modules/@acme/scaffold/**"],
    electronVersion,
    directories: { output: "dist", buildResources: "apps/desktop/resources" },
    extraMetadata: { main: "apps/desktop/dist-electron/main.js" },
    protocols: desktopPkg.build?.protocols,
    publish: desktopPkg.build?.publish,
    mac: {
      category: "public.app-category.developer-tools",
      target: ["dmg", "zip"],
      icon: "icon.png",
      hardenedRuntime: true,
      notarize: false
    },
    dmg: { title: productName, artifactName: `${productName}.\${ext}` }
  };

  const stagePkg = {
    name: "snug-desktop-staged",
    version: desktopPkg.version,
    private: true,
    description: desktopPkg.description ?? "Snug",
    author: desktopPkg.author ?? "Snug",
    main: "apps/desktop/dist-electron/main.js",
    dependencies: stagePackDependencies(),
    devDependencies: {
      electron: electronVersion,
      "electron-builder": desktopPkg.devDependencies["electron-builder"]
    },
    build: buildConfig
  };

  fs.writeFileSync(path.join(stageRoot, "package.json"), `${JSON.stringify(stagePkg, null, 2)}\n`);
  console.log("[snug pack] Stage:", stageRoot);

  // ── Install & run electron-builder (signing only, no notarization) ─
  run("bun", ["install"], { cwd: stageRoot });

  const ebBin = path.join(stageRoot, "node_modules", ".bin", "electron-builder");
  if (!fs.existsSync(ebBin)) {
    console.error(`[snug pack] electron-builder not found at ${ebBin}`);
    process.exit(1);
  }

  const env = { ...process.env };
  if (noCodesign) {
    env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  }

  console.log("[snug pack] Building + signing (notarization handled separately)…");
  run(ebBin, ["--mac", "dmg", "zip", "--publish", "never"], { cwd: stageRoot, env });

  const distRoot = path.join(stageRoot, "dist");
  const appPath = findBuiltMacApp(distRoot);

  if (!appPath) {
    console.error("[snug pack] .app not found under", distRoot);
    process.exit(1);
  }

  console.log("[snug pack] Signed .app:", appPath);

  // ── Notarize with xcrun notarytool (stdio: inherit = full visibility) ─
  if (shouldNotarize) {
    const appleId = process.env.APPLE_ID;
    const applePassword = getApplePassword();
    const teamId = process.env.APPLE_TEAM_ID;

    // Zip the .app for submission
    const notarizeZip = path.join(distRoot, "__notarize.zip");
    console.log("\n[snug pack] Zipping .app for notarization…");
    run("ditto", ["-c", "-k", "--keepParent", appPath, notarizeZip]);

    // Submit and wait — all output visible in terminal
    console.log("[snug pack] Submitting to Apple notarization (this takes 5-15 min)…\n");
    run("xcrun", [
      "notarytool", "submit", notarizeZip,
      "--apple-id", appleId,
      "--password", applePassword,
      "--team-id", teamId,
      "--wait"
    ]);

    // Staple the .app
    console.log("\n[snug pack] Stapling notarization ticket to .app…");
    run("xcrun", ["stapler", "staple", appPath]);

    // Rebuild DMG from stapled .app
    // No need to notarize the DMG separately — Gatekeeper checks the .app inside.
    // T3 Code does the same: one notarization for the .app only.
    console.log("[snug pack] Rebuilding DMG from stapled .app…");
    const dmgPath = path.join(distRoot, `${productName}.dmg`);
    if (fs.existsSync(dmgPath)) fs.unlinkSync(dmgPath);
    run("hdiutil", [
      "create", "-volname", productName,
      "-srcfolder", appPath,
      "-ov", "-format", "UDZO",
      dmgPath
    ]);

    // Cleanup
    if (fs.existsSync(notarizeZip)) fs.unlinkSync(notarizeZip);
    console.log("[snug pack] ✓ Notarization + staple + DMG rebuild complete\n");
  } else {
    console.log("[snug pack] Skipping notarization.");
  }

  // ── Standardize update zip for electron-updater ─────────────────────
  const zipBase = `${productName}-${desktopPkg.version}-mac.zip`;
  const zipPath = path.join(distRoot, zipBase);
  for (const name of fs.readdirSync(distRoot)) {
    if (name.endsWith("-mac.zip") && name !== zipBase) {
      fs.unlinkSync(path.join(distRoot, name));
    }
  }
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  run("ditto", ["-c", "-k", "--keepParent", appPath, zipPath]);
  writeLatestMacYml(distRoot, zipPath, desktopPkg.version);

  // ── Copy to release/ ──────────────────────────────────────────────
  fs.mkdirSync(releaseDir, { recursive: true });
  for (const name of fs.readdirSync(releaseDir)) {
    if (name.endsWith("-mac.zip") || name === "latest-mac.yml" || name.endsWith(".dmg")) {
      fs.unlinkSync(path.join(releaseDir, name));
    }
  }
  for (const name of fs.readdirSync(distRoot)) {
    const from = path.join(distRoot, name);
    if (!fs.statSync(from).isFile()) continue;
    if (name.startsWith("__")) continue; // skip temp files
    fs.copyFileSync(from, path.join(releaseDir, name));
    console.log("[snug pack] ->", path.join(releaseDir, name));
  }

  console.log(`\n[snug pack] ✓ Done. Artifacts in ${releaseDir}\n`);
} finally {
  if (keepStage) {
    console.log("[snug pack] SNUG_KEEP_PACK_STAGE=1 — left stage at", stageRoot);
  } else {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}
