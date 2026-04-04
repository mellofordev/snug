#!/usr/bin/env node

/**
 * Release — bump version (optional), build mac artifacts, upload to R2.
 *
 * Recommended (one command — version matches binaries on CDN):
 *   bun run release --bump patch --notes "Bug fixes"
 *
 *   1. Bumps apps/desktop/package.json (electron-updater uses this version).
 *   2. Runs bun run dist:mac:production (sign, notarytool+staple, write Snug-<ver>-mac.zip + latest-mac.yml).
 *   3. Uploads latest-mac.yml, zip, and DMG to R2.
 *
 * Re-upload only (same version, e.g. retry after network error):
 *   bun run release --upload-only
 *
 * Bump version in git only, build/upload later:
 *   bun run release --bump patch --no-build
 *   bun run dist:mac:production
 *   bun run release --upload-only
 */

import { spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

const ROOT = path.resolve(import.meta.dirname, "..");
const DESKTOP_PKG_PATH = path.join(ROOT, "apps", "desktop", "package.json");
const DMG_DIR = path.join(ROOT, "apps", "desktop", "release");

const argv = process.argv;
const uploadOnly = argv.includes("--upload-only");
const noBuild = argv.includes("--no-build");

const bumpIdx = argv.indexOf("--bump");
const bumpType = bumpIdx !== -1 ? argv[bumpIdx + 1] : null;

// ── Version bumping ─────────────────────────────────────────────────────

function bumpVersion(current, type) {
  const [major = 0, minor = 0, patch = 0] = current.split(".").map(Number);
  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid bump type: ${type}`);
  }
}

if (uploadOnly) {
  if (bumpType) {
    console.error("\n  ✗ Do not combine --upload-only with --bump.\n");
    process.exit(1);
  }
  if (noBuild) {
    console.error("\n  ✗ --no-build only applies with --bump.\n");
    process.exit(1);
  }
} else {
  if (!bumpType || !["major", "minor", "patch"].includes(bumpType)) {
    console.error(`
  Usage:

    Bump, build (dist:mac:production), and upload — recommended:
      bun run release --bump patch --notes "What changed"

    Re-upload apps/desktop/release/ without changing version:
      bun run release --upload-only

    Bump only (then run dist:mac:production and release --upload-only yourself):
      bun run release --bump patch --no-build
`);
    process.exit(1);
  }

  const desktopPkg = JSON.parse(readFileSync(DESKTOP_PKG_PATH, "utf8"));
  const oldVersion = desktopPkg.version;
  const newVersion = bumpVersion(oldVersion, bumpType);
  desktopPkg.version = newVersion;
  writeFileSync(DESKTOP_PKG_PATH, `${JSON.stringify(desktopPkg, null, 2)}\n`);
  console.log(`\n  Version bumped: ${oldVersion} → ${newVersion}`);

  if (noBuild) {
    console.log(`
  Next steps:
    bun run dist:mac:production
    bun run release --upload-only
`);
    process.exit(0);
  }

  console.log("\n  Running dist:mac:production (build + sign + notarytool + staple)…\n");
  const buildResult = spawnSync("bun", ["run", "dist:mac:production"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env }
  });
  if (buildResult.status !== 0) {
    process.exit(buildResult.status ?? 1);
  }
}

// ── Load version from disk (authoritative for upload) ───────────────────

const DESKTOP_PKG = JSON.parse(readFileSync(DESKTOP_PKG_PATH, "utf8"));
const VERSION = DESKTOP_PKG.version;

// Load .env from repo root if present
try {
  const envPath = path.join(ROOT, ".env");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^\s*([\w]+)\s*=\s*(.+?)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
} catch {
  /* ignore */
}

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;

if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) {
  console.error("✗ Missing R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).");
  process.exit(1);
}

const BUCKET = "snug";
const R2_ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

// ── S3v4 signing ──────────────────────────────────────────────────────────

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key, data) {
  return createHmac("sha256", key).update(data).digest();
}

function getSignatureKey(secretKey, dateStamp, region, service) {
  let key = hmacSha256(`AWS4${secretKey}`, dateStamp);
  key = hmacSha256(key, region);
  key = hmacSha256(key, service);
  key = hmacSha256(key, "aws4_request");
  return key;
}

async function r2Put(objectKey, body, contentType) {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = `${now.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  const region = "auto";
  const service = "s3";

  const payloadHash = sha256(body);
  const canonicalUri = `/${BUCKET}/${objectKey}`;
  const canonicalQueryString = "";
  const host = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = ["PUT", canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, payloadHash].join(
    "\n"
  );

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");

  const signingKey = getSignatureKey(SECRET_KEY, dateStamp, region, service);
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`${R2_ENDPOINT}${canonicalUri}`, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      Host: host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authorization
    },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 PUT ${objectKey} failed (${res.status}): ${text}`);
  }
}

// ── Artifacts (must match apps/desktop/package.json version) ────────────

const dmgName = "Snug.dmg";
const dmgPath = path.join(DMG_DIR, dmgName);
const ymlPath = path.join(DMG_DIR, "latest-mac.yml");
const expectedZip = `Snug-${VERSION}-mac.zip`;
const zipPath = path.join(DMG_DIR, expectedZip);
const staleZips = existsSync(DMG_DIR)
  ? readdirSync(DMG_DIR).filter((f) => f.endsWith("-mac.zip") && f !== expectedZip)
  : [];

if (!existsSync(dmgPath)) {
  console.error(
    `\n  ✗ ${dmgPath} not found.\n  Run "bun run dist:mac:production" (or "bun run release --bump patch").\n`
  );
  process.exit(1);
}
if (!existsSync(zipPath)) {
  console.error(
    `\n  ✗ Expected update zip missing: ${expectedZip}\n` +
      `    (apps/desktop/package.json version is ${VERSION})\n` +
      (staleZips.length
        ? `    Other zips in release/ (stale — delete or rebuild): ${staleZips.join(", ")}\n`
        : "") +
      `  Run: bun run dist:mac:production\n`
  );
  process.exit(1);
}
if (!existsSync(ymlPath)) {
  console.error(`\n  ✗ latest-mac.yml not found in ${DMG_DIR}.\n`);
  process.exit(1);
}

const zipFile = expectedZip;

// Parse --notes flag
let releaseNotes = "";
const notesIdx = argv.indexOf("--notes");
if (notesIdx !== -1 && argv[notesIdx + 1]) {
  releaseNotes = argv[notesIdx + 1];
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  releaseNotes = await new Promise((resolve) => {
    rl.question("Release notes (optional): ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

console.log(`\n  Uploading Snug v${VERSION} to R2…`);

const ymlBuffer = readFileSync(ymlPath);
await r2Put("releases/latest/latest-mac.yml", ymlBuffer, "text/yaml");
console.log("  ✓ latest-mac.yml");

const zipBuffer = readFileSync(zipPath);
await r2Put(`releases/latest/${zipFile}`, zipBuffer, "application/zip");
console.log(`  ✓ ${zipFile}`);

const dmgBuffer = readFileSync(dmgPath);
await r2Put(`releases/latest/${dmgName}`, dmgBuffer, "application/octet-stream");
console.log(`  ✓ ${dmgName}`);

console.log(`
  ✓ Released Snug v${VERSION}
    YML:  https://cdn.snug.video/releases/latest/latest-mac.yml
    ZIP:  https://cdn.snug.video/releases/latest/${zipFile}
    DMG:  https://cdn.snug.video/releases/latest/${dmgName}
    Notes: ${releaseNotes || "(none)"}
`);
