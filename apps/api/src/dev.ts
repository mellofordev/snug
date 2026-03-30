/**
 * Local API server: Bun + Hono's Web Fetch handler (no Wrangler / Miniflare).
 *
 * Required env vars for auth:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET
 */
import type { Env } from "./app";
import { app } from "./app";

const port = Number(process.env.PORT) || 8787;

const env: Env = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
  JWT_SECRET: process.env.JWT_SECRET ?? "dev-secret-change-me"
};

console.log(`[snug-api] http://127.0.0.1:${port}`);

if (!env.GOOGLE_CLIENT_ID) {
  console.warn("[snug-api] ⚠ GOOGLE_CLIENT_ID not set — auth will fail");
}

Bun.serve({
  fetch: (req) => app.fetch(req, env),
  port
});
