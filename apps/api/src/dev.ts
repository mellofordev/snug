/**
 * Local API server: Bun + Hono’s Web Fetch handler (no Wrangler / Miniflare).
 */
import { app } from "./app";

const port = Number(process.env.PORT) || 8787;

console.log(`[snug-api] http://127.0.0.1:${port}`);

Bun.serve({
  fetch: app.fetch,
  port
});
