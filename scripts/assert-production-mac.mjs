#!/usr/bin/env node
/**
 * Fail fast before a “production” macOS build: macOS only, signing + notarytool/staple
 * after pack, Apple credentials in .env (no SNUG_NO_CODESIGN / SNUG_ALLOW_UNNOTARIZED).
 *
 * Used by: bun run dist:mac:production, and release.mjs before dist:mac.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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
} catch {
  /* ignore */
}

if (process.platform !== "darwin") {
  console.error(
    "\n[snug production] Build on a Mac. Signing and notarization (Developer ID + Apple notary) only run on macOS.\n"
  );
  process.exit(1);
}

if (process.env.SNUG_NO_CODESIGN === "1") {
  console.error(
    "\n[snug production] SNUG_NO_CODESIGN=1 is set. Unset it for a build you will ship to users.\n"
  );
  process.exit(1);
}

if (process.env.SNUG_ALLOW_UNNOTARIZED === "1") {
  console.error(
    "\n[snug production] SNUG_ALLOW_UNNOTARIZED=1 is set. Unset it for a build you will ship to users.\n"
  );
  process.exit(1);
}

const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_ID_PASSWORD, APPLE_TEAM_ID } = process.env;
if (!APPLE_ID || !(APPLE_APP_SPECIFIC_PASSWORD || APPLE_ID_PASSWORD) || !APPLE_TEAM_ID) {
  console.error(`
[snug production] Missing Apple credentials:
`);
  process.exit(1);
}

console.log(
  "[snug production] OK\n"
);
