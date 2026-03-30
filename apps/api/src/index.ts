/**
 * Cloudflare Worker entry — `workerd` (V8), not Bun. `wrangler.toml` points here.
 * Local development: use `bun run dev` → `src/dev.ts` (Bun.serve + same Hono app).
 */
import { app } from "./app";

export default app;
