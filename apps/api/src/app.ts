import { Hono } from "hono";
import { cors } from "hono/cors";

/** Cloudflare Worker bindings — extend when you add KV, D1, secrets, etc. */
export type Env = Record<string, never>;

export const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"]
  })
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "snug-api"
  })
);

/**
 * Desktop app calls this to decide if a newer build exists.
 * Wire to R2, GitHub Releases API, or static JSON later.
 */
app.get("/updates", (c) => {
  const version = c.req.query("version") ?? "";
  const platform = c.req.query("platform") ?? "";
  const arch = c.req.query("arch") ?? "";
  const channel = c.req.query("channel") ?? "stable";

  return c.json({
    updateAvailable: false,
    latestVersion: null as string | null,
    url: null as string | null,
    notes: null as string | null,
    meta: { version, platform, arch, channel }
  });
});

/** Placeholder — replace with OAuth/session (e.g. D1 + signed cookies, or external IdP). */
app.post("/auth/login", (c) =>
  c.json(
    {
      error: "not_implemented",
      message: "Login will be implemented with your auth provider."
    },
    501
  )
);

app.get("/auth/me", (c) =>
  c.json(
    {
      error: "not_implemented",
      message: "Session validation not wired yet."
    },
    501
  )
);
