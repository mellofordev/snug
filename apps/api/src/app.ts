import { Hono } from "hono";
import { cors } from "hono/cors";
import { sign, verify } from "hono/jwt";

import { createDb } from "./db";
import { users } from "./db/schema";

/** Cloudflare Worker bindings — secrets set via `npx wrangler secret put <NAME>`. */
export type Env = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  JWT_SECRET: string;
  DATABASE_URL: string;
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

// ── Auth ────────────────────────────────────────────────────────────────

app.get("/auth/config", (c) => {
  return c.json({
    googleClientId: c.env.GOOGLE_CLIENT_ID
  });
});

/**
 * Exchange a Google authorization code for a Snug JWT + user profile.
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

  // Upsert user in database
  const db = createDb(c.env.DATABASE_URL);

  const rows = await db
    .insert(users)
    .values({
      googleId: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
    })
    .onConflictDoUpdate({
      target: users.googleId,
      set: {
        email: googleUser.email,
        name: googleUser.name,
        picture: googleUser.picture,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      picture: users.picture,
    });

  const dbUser = rows[0];
  if (!dbUser) {
    return c.json({ error: "db_error", message: "Failed to save user" }, 500);
  }

  // Sign a Snug JWT with the DB user id
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    picture: dbUser.picture,
    iat: now,
    exp: now + 30 * 24 * 60 * 60 // 30 days
  };

  const token = await sign(payload, c.env.JWT_SECRET, "HS256");

  return c.json({
    token,
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      picture: dbUser.picture
    }
  });
});

/**
 * Validate a Snug JWT and return the user profile.
 */
app.get("/auth/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "unauthorized", message: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = (await verify(token, c.env.JWT_SECRET, "HS256")) as Record<string, unknown>;
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

