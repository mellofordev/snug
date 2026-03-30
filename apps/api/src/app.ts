import { Hono } from "hono";
import { cors } from "hono/cors";
import { sign, verify } from "hono/jwt";

/** Cloudflare Worker bindings — secrets set via `npx wrangler secret put <NAME>`. */
export type Env = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  JWT_SECRET: string;
};

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

// ── Auth ────────────────────────────────────────────────────────────────

/**
 * Returns the Google Client ID so the desktop app can build the OAuth URL.
 * Client ID is not secret — it's embedded in the consent screen URL.
 */
app.get("/auth/config", (c) => {
  return c.json({
    googleClientId: c.env.GOOGLE_CLIENT_ID
  });
});

/**
 * Exchange a Google authorization code for a Snug JWT + user profile.
 *
 * The desktop app opens a BrowserWindow with Google's consent screen,
 * intercepts the redirect to capture `code`, and POSTs it here.
 */
app.post("/auth/google", async (c) => {
  const body = await c.req.json<{ code: string; redirectUri: string }>().catch(() => null);
  if (!body?.code || !body?.redirectUri) {
    return c.json({ error: "missing_params", message: "code and redirectUri are required" }, 400);
  }

  // Exchange authorization code for Google tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: body.code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: body.redirectUri,
      grant_type: "authorization_code"
    })
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return c.json({ error: "google_token_error", message: err }, 401);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };

  // Fetch user profile from Google
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });

  if (!userRes.ok) {
    return c.json({ error: "google_userinfo_error", message: "Failed to fetch user info" }, 401);
  }

  const googleUser = (await userRes.json()) as {
    id: string;
    email: string;
    name: string;
    picture: string;
  };

  // Sign a Snug JWT
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: googleUser.id,
    email: googleUser.email,
    name: googleUser.name,
    picture: googleUser.picture,
    iat: now,
    exp: now + 30 * 24 * 60 * 60 // 30 days
  };

  const token = await sign(payload, c.env.JWT_SECRET, "HS256");

  return c.json({
    token,
    user: {
      id: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture
    }
  });
});

/**
 * Validate a Snug JWT and return the user profile.
 * Called on app launch to restore an existing session.
 */
app.get("/auth/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "unauthorized", message: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verify(token, c.env.JWT_SECRET, "HS256");
    return c.json({
      user: {
        id: payload.sub as string,
        email: payload.email as string,
        name: payload.name as string,
        picture: (payload.picture as string) ?? null
      }
    });
  } catch {
    return c.json({ error: "invalid_token", message: "Token is invalid or expired" }, 401);
  }
});
