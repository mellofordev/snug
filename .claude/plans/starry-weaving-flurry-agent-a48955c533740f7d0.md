# Google OAuth Login + Onboarding Screen — Implementation Plan

## Overview

Add Google OAuth authentication to the Snug Electron app with a full-screen onboarding splash that gates access to the main UI. The flow spans four packages: contracts (shared types), API (token exchange), desktop (OAuth window + secure storage), and renderer (onboarding UI + auth state).

---

## Implementation Order

The plan follows a dependency-first order: contracts first (types everything else depends on), then API (token exchange endpoint), then desktop (OAuth window + storage), then renderer (UI).

---

## Phase 1: Contracts — Auth Types and IPC Additions

### 1A. New file: `packages/contracts/src/auth.ts`

Define Zod schemas and inferred types for auth data shared across all packages.

```ts
import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  picture: z.string().url().nullable(),
});

export const authSessionSchema = z.object({
  token: z.string(),
  user: userSchema,
});

export type User = z.infer<typeof userSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
```

**Why `id` is a string**: The API will generate a stable user ID (e.g., hash of Google sub or the sub itself). Keeping it a string allows the API to change its ID strategy later without a contracts change.

### 1B. Modify: `packages/contracts/src/ipc.ts`

Add auth IPC channel names and the `auth` namespace to `NativeApi`:

```ts
// New channel constants (add to IPC_CHANNELS):
authLoginWithGoogle: "auth:login-with-google",
authGetSession: "auth:get-session",
authLogout: "auth:logout",

// New namespace on NativeApi:
auth: {
  loginWithGoogle: () => Promise<AuthSession>;
  getSession: () => Promise<AuthSession | null>;
  logout: () => Promise<void>;
};
```

Import `AuthSession` from `./auth`. The `loginWithGoogle` method returns the full session (token + user) so the renderer can immediately display the user's name/picture without a second round-trip.

### 1C. Modify: `packages/contracts/src/index.ts`

Add `export * from "./auth";` alongside the existing agent and ipc exports.

---

## Phase 2: API — Google OAuth Token Exchange

### 2A. Modify: `apps/api/src/app.ts`

**Env type change** — replace `Record<string, never>` with real bindings:

```ts
export type Env = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  JWT_SECRET: string;
};
```

**Replace the two auth stubs** with:

#### `POST /auth/google`

Request body: `{ code: string; redirectUri: string }`

Implementation steps:
1. Parse + validate body with Zod (inline schema, not from contracts — keeps the API self-contained and avoids importing Zod schemas that reference client-side types).
2. Exchange `code` for tokens via `fetch("https://oauth2.googleapis.com/token", ...)` with `grant_type=authorization_code`, the code, redirect URI, client ID, and client secret. Content-Type: `application/x-www-form-urlencoded`.
3. On success, extract `access_token` from Google's JSON response.
4. Fetch user info: `fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: "Bearer " + accessToken } })`.
5. Build user object: `{ id: googleUserInfo.id, email, name, picture }`.
6. Sign a JWT using `hono/jwt`'s `sign()`: payload is `{ sub: user.id, email, name, picture, iat, exp }`. Set `exp` to 7 days from now.
7. Return `{ token, user }` as JSON (200).

Error handling:
- If Google token exchange fails, return 401 with `{ error: "google_auth_failed", message }`.
- If user info fetch fails, return 502 with `{ error: "google_userinfo_failed" }`.

#### `GET /auth/me`

1. Read `Authorization` header, expect `Bearer <token>`.
2. Verify JWT with `hono/jwt`'s `verify()` using `JWT_SECRET`.
3. On success, return `{ user: { id, email, name, picture } }` extracted from the JWT payload.
4. On failure (expired, invalid), return 401 `{ error: "invalid_token" }`.

**Important Cloudflare Workers notes**:
- `hono/jwt` uses the Web Crypto API internally, which Workers support. No Node.js-only deps.
- The `sign` and `verify` functions from `hono/jwt` are async (they return Promises).
- The Google token exchange uses `application/x-www-form-urlencoded` encoding, built with `URLSearchParams`.

### 2B. Modify: `apps/api/wrangler.toml`

Add a comment block documenting the required secrets:

```toml
# Required secrets (set via `npx wrangler secret put <NAME>`):
# GOOGLE_CLIENT_ID     — from Google Cloud Console
# GOOGLE_CLIENT_SECRET — from Google Cloud Console
# JWT_SECRET           — random string for signing JWTs
```

No `[vars]` block needed since these are secrets, not plain env vars.

---

## Phase 3: Desktop — OAuth Flow, Token Storage, IPC

### 3A. Modify: `apps/desktop/src/settingsStore.ts`

Add `authToken` to the `Settings` interface:

```ts
interface Settings {
  baseDirectory: string | null;
  lastOpenedDirectory: string | null;
  authToken: string | null;  // base64-encoded safeStorage-encrypted JWT
}

const DEFAULTS: Settings = { baseDirectory: null, lastOpenedDirectory: null, authToken: null };
```

Add getter/setter pair following existing pattern:

```ts
getAuthToken(): string | null { return this.settings.authToken; }
async setAuthToken(token: string | null): Promise<void> {
  this.settings.authToken = token;
  await this.persist();
}
```

### 3B. New file: `apps/desktop/src/authManager.ts`

This module encapsulates three concerns: OAuth BrowserWindow flow, encrypted token storage, and session validation.

```ts
import { BrowserWindow, safeStorage } from "electron";
import type { AuthSession, User } from "@acme/contracts";

const API_BASE_URL = process.env.SNUG_API_URL || "http://127.0.0.1:8787";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const REDIRECT_URI = "http://localhost/oauth/callback";

export class AuthManager {
  constructor(private settingsStore: SettingsStore) {}

  async loginWithGoogle(): Promise<AuthSession> { ... }
  async getSession(): Promise<AuthSession | null> { ... }
  async logout(): Promise<void> { ... }

  private encryptAndStore(token: string): Promise<void> { ... }
  private readAndDecrypt(): string | null { ... }
}
```

#### `loginWithGoogle()`

1. Build Google OAuth URL:
   ```
   https://accounts.google.com/o/oauth2/v2/auth?
     client_id=GOOGLE_CLIENT_ID&
     redirect_uri=http://localhost/oauth/callback&
     response_type=code&
     scope=email profile&
     access_level=offline&
     prompt=select_account
   ```
   `prompt=select_account` ensures the user can pick which Google account.

2. Create a `BrowserWindow` (600x700, not resizable, parent = mainWindow if available):
   ```ts
   const authWindow = new BrowserWindow({
     width: 600,
     height: 700,
     show: true,
     webPreferences: {
       nodeIntegration: false,
       contextIsolation: true,
     },
   });
   ```

3. Load the OAuth URL.

4. Listen for navigation to extract the auth code:
   ```ts
   authWindow.webContents.on("will-redirect", (event, url) => {
     const parsed = new URL(url);
     if (parsed.hostname === "localhost" && parsed.pathname === "/oauth/callback") {
       event.preventDefault();
       const code = parsed.searchParams.get("code");
       // ... handle code
       authWindow.close();
     }
   });
   ```
   Also listen to `will-navigate` as a fallback — some Google flows use navigation rather than redirect.

5. Handle `close` event on the window — if closed without extracting a code, reject the promise with a user-cancelled error.

6. POST the code to the API:
   ```ts
   const res = await fetch(`${API_BASE_URL}/auth/google`, {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ code, redirectUri: REDIRECT_URI }),
   });
   ```

7. Parse the response as `AuthSession`, encrypt and store the token, return the session.

#### `getSession()`

1. Read encrypted token from settings via `readAndDecrypt()`.
2. If no token, return `null`.
3. Validate the token against the API: `GET /auth/me` with `Authorization: Bearer <token>`.
4. If valid, return `{ token, user }`.
5. If 401/invalid, clear the stored token and return `null`.

**Design note**: We validate against the API rather than decoding the JWT locally because (a) the desktop doesn't need to know the JWT_SECRET, and (b) the API can revoke tokens in the future.

#### `encryptAndStore(token)`

```ts
if (!safeStorage.isEncryptionAvailable()) {
  // Fallback: store plaintext (log a warning)
  await this.settingsStore.setAuthToken(token);
  return;
}
const encrypted = safeStorage.encryptString(token);
await this.settingsStore.setAuthToken(encrypted.toString("base64"));
```

#### `readAndDecrypt()`

```ts
const stored = this.settingsStore.getAuthToken();
if (!stored) return null;
if (!safeStorage.isEncryptionAvailable()) return stored; // plaintext fallback
try {
  return safeStorage.decryptString(Buffer.from(stored, "base64"));
} catch {
  return null; // corrupted — treat as logged out
}
```

#### `logout()`

Clear the stored token:
```ts
await this.settingsStore.setAuthToken(null);
```

### 3C. Modify: `apps/desktop/src/ipcChannels.ts`

Add the three new channel constants, matching contracts:

```ts
authLoginWithGoogle: "auth:login-with-google",
authGetSession: "auth:get-session",
authLogout: "auth:logout",
```

### 3D. Modify: `apps/desktop/src/main.ts`

1. Import `AuthManager`.
2. Instantiate it after `settingsStore.init()`:
   ```ts
   const authManager = new AuthManager(settingsStore);
   ```
3. Register three new IPC handlers inside `registerIpcHandlers()`:
   ```ts
   ipcMain.handle(IPC_CHANNELS.authLoginWithGoogle, async () => {
     return authManager.loginWithGoogle();
   });
   ipcMain.handle(IPC_CHANNELS.authGetSession, async () => {
     return authManager.getSession();
   });
   ipcMain.handle(IPC_CHANNELS.authLogout, async () => {
     return authManager.logout();
   });
   ```

### 3E. Modify: `apps/desktop/src/preload.ts`

Add the `auth` namespace to the `nativeApi` object exposed via `contextBridge`:

```ts
auth: {
  loginWithGoogle: () => ipcRenderer.invoke(IPC_CHANNELS.authLoginWithGoogle),
  getSession: () => ipcRenderer.invoke(IPC_CHANNELS.authGetSession),
  logout: () => ipcRenderer.invoke(IPC_CHANNELS.authLogout),
},
```

---

## Phase 4: Renderer — Onboarding UI + Auth State

### 4A. New file: `apps/renderer/src/hooks/use-auth.ts`

A React hook that manages auth state and exposes it to the component tree.

```ts
import { useCallback, useEffect, useState } from "react";
import type { NativeApi, User } from "@acme/contracts";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(api: NativeApi | undefined): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    if (!api) return;
    api.auth.getSession()
      .then((session) => {
        if (session) setUser(session.user);
      })
      .catch(() => { /* no session */ })
      .finally(() => setLoading(false));
  }, [api]);

  const login = useCallback(async () => {
    if (!api) return;
    try {
      const session = await api.auth.loginWithGoogle();
      setUser(session.user);
    } catch (err) {
      // User cancelled or auth failed — stay on onboarding
      console.error("Login failed:", err);
    }
  }, [api]);

  const logout = useCallback(async () => {
    if (!api) return;
    await api.auth.logout();
    setUser(null);
  }, [api]);

  return { user, loading, login, logout };
}
```

**Key behavior**: On app launch, `loading` is `true` while `getSession()` validates the stored token. This prevents a flash of the onboarding screen for already-authenticated users.

### 4B. New file: `apps/renderer/src/components/onboarding.tsx`

Full-screen splash that replaces the entire app UI when not authenticated.

Design approach — follows existing patterns:
- Uses `Button` from `@/components/ui/button` (existing component)
- Uses Tailwind classes matching the app's design system (`bg-background`, `text-foreground`, etc.)
- Centered card layout similar to the "Native bridge unavailable" fallback in `App.tsx`

```tsx
import { Button } from "@/components/ui/button";

interface OnboardingProps {
  onLogin: () => Promise<void>;
  loading: boolean;
}

export function Onboarding({ onLogin, loading }: OnboardingProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-8 text-foreground">
      <div className="flex flex-col items-center gap-6">
        {/* Snug logo/branding */}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Snug</h1>
          <p className="text-sm text-muted-foreground">
            AI-powered video creation
          </p>
        </div>

        <Button
          size="lg"
          onClick={onLogin}
          disabled={loading}
        >
          {loading ? "Checking session…" : "Sign in with Google"}
        </Button>
      </div>
    </main>
  );
}
```

**Notes**:
- The component is intentionally simple. The `onLogin` callback triggers the desktop OAuth flow which opens a separate BrowserWindow. The user interacts with Google's consent screen in that window, not in this component.
- A Google "G" logo SVG can be added inline next to the button text for polish. Keep it as an inline SVG (not an external asset) to avoid asset-loading complexity.
- The `loading` state (from `useAuth`) is passed through to disable the button and show "Checking session..." during the initial `getSession()` call.

### 4C. Modify: `apps/renderer/src/App.tsx`

Wrap the existing content with an auth gate:

```tsx
import { useAuth } from "@/hooks/use-auth";
import { Onboarding } from "@/components/onboarding";

export default function App() {
  const api = useNativeApi();
  const auth = useAuth(api);
  const state = useAppState(api);

  if (!api) {
    return (/* existing "Native bridge unavailable" fallback */);
  }

  if (!auth.user) {
    return <Onboarding onLogin={auth.login} loading={auth.loading} />;
  }

  return (
    <TooltipProvider>
      {/* existing app content — unchanged */}
    </TooltipProvider>
  );
}
```

**Ordering matters**: `useAuth` must be called unconditionally (React hook rules), but the onboarding gate is checked before rendering the main UI. The `useAppState` hook also runs unconditionally but its effects are guarded by `api` being defined, so there is no wasted work.

**Logout**: A logout button can be added later to the side panel or top bar. The `auth.logout` function from `useAuth` handles clearing the session and returning the user to onboarding. This is a separate concern and not blocking for the initial implementation.

---

## Phase 5: Configuration and Environment

### API Base URL Propagation

The renderer needs to know the API URL only if it makes direct API calls. In this design, all API communication goes through the desktop (IPC -> main process -> fetch). The renderer never calls the API directly. This means:

- The desktop main process reads `SNUG_API_URL` from `process.env` (set during development, hardcoded or configured for production).
- No `VITE_API_URL` env var is needed in the renderer.

### Google Cloud Console Setup (Documentation Only)

Document in the project README or a `docs/auth-setup.md`:
1. Create a Google Cloud project.
2. Enable the Google+ API (or People API).
3. Create OAuth 2.0 credentials (Desktop application type).
4. Add `http://localhost/oauth/callback` as an authorized redirect URI.
5. Copy Client ID and Client Secret.
6. For the API (Cloudflare Workers): `npx wrangler secret put GOOGLE_CLIENT_ID`, etc.
7. For local desktop dev: set `GOOGLE_CLIENT_ID` env var.

---

## Edge Cases and Error Handling

1. **User closes OAuth window without completing**: The `loginWithGoogle()` promise rejects. `useAuth.login()` catches this silently — user stays on onboarding.

2. **Token expired on app relaunch**: `getSession()` calls `/auth/me`, gets 401, clears stored token, returns `null` — user sees onboarding.

3. **safeStorage unavailable** (rare — e.g., Linux without a keyring): Fall back to plaintext storage with a console warning. The token is still stored in the user's app data directory which has OS-level file permissions.

4. **Network offline during getSession()**: The fetch to `/auth/me` fails. Treat as no session — show onboarding. Could be improved later with offline JWT verification.

5. **Multiple login attempts**: If the user clicks "Sign in" while an OAuth window is already open, either focus the existing window or prevent opening a second one. Implement with a class-level `authWindow` reference in `AuthManager`.

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/contracts/src/auth.ts` | CREATE | User + AuthSession Zod schemas and types |
| `packages/contracts/src/ipc.ts` | MODIFY | Add auth channels + NativeApi.auth namespace |
| `packages/contracts/src/index.ts` | MODIFY | Export auth module |
| `apps/api/src/app.ts` | MODIFY | Replace auth stubs with Google OAuth + JWT endpoints |
| `apps/api/wrangler.toml` | MODIFY | Document required secrets |
| `apps/desktop/src/settingsStore.ts` | MODIFY | Add authToken field |
| `apps/desktop/src/authManager.ts` | CREATE | OAuth BrowserWindow flow + encrypted token storage |
| `apps/desktop/src/ipcChannels.ts` | MODIFY | Add auth channel constants |
| `apps/desktop/src/main.ts` | MODIFY | Instantiate AuthManager + register auth IPC handlers |
| `apps/desktop/src/preload.ts` | MODIFY | Expose auth namespace via contextBridge |
| `apps/renderer/src/hooks/use-auth.ts` | CREATE | Auth state hook |
| `apps/renderer/src/components/onboarding.tsx` | CREATE | Full-screen login splash |
| `apps/renderer/src/App.tsx` | MODIFY | Auth gate — onboarding if not authenticated |

Total: 4 new files, 9 modified files.

---

## Dependencies to Add

- `hono` already includes `hono/jwt` — no new npm packages needed for the API.
- No new packages needed for the desktop (Electron's `safeStorage` and `BrowserWindow` are built-in).
- No new packages needed for the renderer.

**Zero new dependencies across the entire implementation.**

---

## Testing Approach

1. **API**: Test with `curl` — POST a real Google auth code to `/auth/google`, verify JWT is returned. Use the JWT with `GET /auth/me`.
2. **Desktop**: Manual test — launch dev, click Sign in, complete Google consent, verify token stored (check settings.json for encrypted blob). Relaunch app, verify session restored.
3. **Renderer**: Visual test — verify onboarding shows on first launch, disappears after login, reappears after logout.
