import http from "node:http";
import { app, BrowserWindow, shell } from "electron";

import type { User } from "@acme/contracts";

import type { SettingsStore } from "./settingsStore";

/** Port for the ephemeral local callback server. */
const CALLBACK_PORT = 18329;
/** Must match "Authorized redirect URIs" in Google Cloud Console (not snug://). */
const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/oauth/callback`;

// ── Google OAuth via System Browser ─────────────────────────────────────

export async function loginWithGoogle(
  apiBaseUrl: string,
  settingsStore: SettingsStore,
  focusWindow?: BrowserWindow | null
): Promise<User> {
  // Fetch Google Client ID from the API
  const configRes = await fetch(`${apiBaseUrl}/auth/config`);
  if (!configRes.ok) {
    throw new Error("Failed to fetch auth config from API");
  }
  const { googleClientId } = (await configRes.json()) as { googleClientId: string };

  if (!googleClientId) {
    throw new Error("Google Client ID not configured on the API");
  }

  // Get auth code via system browser + local callback server
  const code = await getAuthCodeViaBrowser(googleClientId, focusWindow);

  // Exchange code for token via our API
  const tokenRes = await fetch(`${apiBaseUrl}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirectUri: REDIRECT_URI })
  });

  if (!tokenRes.ok) {
    const err = (await tokenRes.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `Auth failed (${tokenRes.status})`);
  }

  const { token, user } = (await tokenRes.json()) as { token: string; user: User };

  // Encrypt and store the token
  await storeToken(token, settingsStore);

  return user;
}

/**
 * Opens Google consent in the system browser and spins up a short-lived
 * local HTTP server to receive the redirect with the authorization code.
 */
function getAuthCodeViaBrowser(clientId: string, focusWindow?: BrowserWindow | null): Promise<string> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        server.close();
        reject(new Error("Login timed out — no response within 2 minutes"));
      }
    }, 120_000);

    const server = http.createServer((req, res) => {
      if (resolved) {
        res.writeHead(404);
        res.end();
        return;
      }

      const url = new URL(req.url ?? "/", `http://127.0.0.1:${CALLBACK_PORT}`);
      if (url.pathname !== "/oauth/callback") {
        res.writeHead(404);
        res.end();
        return;
      }

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      resolved = true;
      clearTimeout(timeout);

      // Show a simple success message and bring the Electron window to front directly
      // (avoids reliance on snug:// deep link which can open the wrong binary in dev)
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<html><body style="font-family:system-ui;text-align:center;padding:60px">` +
          `<p style="font-size:18px;color:#333">Sign-in successful!</p>` +
          `<p style="color:#888;font-size:14px;margin-top:12px">You can close this tab and return to Snug.</p>` +
          `</body></html>`
      );

      // Bring Snug to the foreground (localhost callback avoids snug:// opening the wrong handler)
      if (focusWindow) {
        if (focusWindow.isMinimized()) focusWindow.restore();
        focusWindow.show();
        focusWindow.focus();
        if (process.platform === "darwin") {
          app.focus({ steal: true });
        }
      }

      server.close();

      if (error) {
        reject(new Error(`Google OAuth error: ${error}`));
      } else if (code) {
        resolve(code);
      } else {
        reject(new Error("No authorization code in callback"));
      }
    });

    server.listen(CALLBACK_PORT, "127.0.0.1", () => {
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "email profile");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "select_account");

      void shell.openExternal(authUrl.toString());
    });

    server.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Failed to start callback server: ${err.message}`));
      }
    });
  });
}

// ── Session Restoration ─────────────────────────────────────────────────

export async function getSession(
  apiBaseUrl: string,
  settingsStore: SettingsStore
): Promise<User | null> {
  const token = readToken(settingsStore);
  if (!token) return null;

  try {
    const res = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      // Token expired or invalid — clear it
      await settingsStore.clearAuthToken();
      return null;
    }

    const { user } = (await res.json()) as { user: User };
    return user;
  } catch {
    // Network error — return null but don't clear token (might be offline)
    return null;
  }
}

// ── Logout ──────────────────────────────────────────────────────────────

export async function logout(settingsStore: SettingsStore): Promise<void> {
  await settingsStore.clearAuthToken();
}

// ── Token Storage ──────────────────────────────────────────────────────

async function storeToken(token: string, store: SettingsStore): Promise<void> {
  await store.setAuthToken(token);
}

function readToken(store: SettingsStore): string | null {
  return store.getAuthToken();
}
