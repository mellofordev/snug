import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

import { promptInputSchema } from "@acme/contracts";

import { IPC_CHANNELS } from "./ipcChannels";
import { detectAgents, runPrompt, stopPrompt } from "./agentManager";
import { loginWithGoogle, getSession, logout } from "./authManager";
import {
  initProject,
  startPlayer,
  stopPlayer,
  stopAllPlayers,
  renderComposition,
  listCompositions,
  listOutputs,
  readSystemPrompt
} from "./projectManager";
import { SettingsStore } from "./settingsStore";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const apiBaseUrl = isDevelopment
  ? (process.env.SNUG_API_URL ?? "http://localhost:8787")
  : "https://api.snug.video";
const iconPath = path.join(__dirname, "../assets/icon.png");

function rendererIndexPath(): string {
  if (app.isPackaged) {
    // Vite output is copied into apps/desktop/bundled-renderer before electron-pack (see sync-renderer-for-pack).
    return path.join(__dirname, "..", "bundled-renderer", "index.html");
  }
  return path.join(__dirname, "..", "..", "renderer", "dist", "index.html");
}

let mainWindow: BrowserWindow | null = null;
let settingsStore: SettingsStore;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 840,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 12 },
    roundedCorners: true,
    backgroundColor: "#ffffff",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  window.once("ready-to-show", () => {
    window.show();
  });

  if (isDevelopment) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    return window;
  }

  void window.loadFile(rendererIndexPath());
  return window;
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.agentsDetect, async () => {
    return detectAgents();
  });

  ipcMain.handle(IPC_CHANNELS.promptRun, async (_event, payload: unknown) => {
    const input = promptInputSchema.parse(payload);
    const output = runPrompt(input, (update) => {
      mainWindow?.webContents.send(IPC_CHANNELS.promptOutput, update);
    });
    return output;
  });

  ipcMain.handle(IPC_CHANNELS.promptStop, async (_event, id: unknown) => {
    if (typeof id === "string") {
      stopPrompt(id);
    }
  });

  ipcMain.handle(IPC_CHANNELS.dialogSelectDirectory, async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"]
    });
    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.settingsGetBaseDir, async () => {
    return settingsStore.getBaseDirectory();
  });

  ipcMain.handle(IPC_CHANNELS.settingsSetBaseDir, async (_event, dir: unknown) => {
    if (typeof dir === "string") {
      await settingsStore.setBaseDirectory(dir);
    }
  });

  ipcMain.handle(IPC_CHANNELS.settingsGetLastDir, async () => {
    return settingsStore.getLastOpenedDirectory();
  });

  ipcMain.handle(IPC_CHANNELS.settingsSetLastDir, async (_event, dir: unknown) => {
    if (typeof dir === "string") {
      await settingsStore.setLastOpenedDirectory(dir);
    }
  });

  ipcMain.handle(IPC_CHANNELS.fsCreateDirectory, async (_event, fullPath: unknown) => {
    if (typeof fullPath !== "string" || !fullPath) {
      throw new Error("Invalid directory path");
    }
    await fs.mkdir(fullPath, { recursive: true });
    return fullPath;
  });

  ipcMain.handle(IPC_CHANNELS.shellOpenPath, async (_event, filePath: unknown) => {
    if (typeof filePath !== "string" || !filePath) {
      throw new Error("Invalid file path");
    }
    const err = await shell.openPath(filePath);
    if (err) {
      throw new Error(err);
    }
  });

  // ── Project handlers ──────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.projectInit, async (_event, dir: unknown) => {
    if (typeof dir !== "string") throw new Error("Invalid directory");
    return initProject(dir);
  });

  ipcMain.handle(IPC_CHANNELS.projectStartPlayer, async (_event, dir: unknown) => {
    if (typeof dir !== "string") throw new Error("Invalid directory");
    return startPlayer(dir);
  });

  ipcMain.handle(IPC_CHANNELS.projectStopPlayer, async (_event, dir: unknown) => {
    if (typeof dir !== "string") throw new Error("Invalid directory");
    return stopPlayer(dir);
  });

  ipcMain.handle(IPC_CHANNELS.projectRender, async (_event, dir: unknown, compositionId: unknown) => {
    if (typeof dir !== "string" || typeof compositionId !== "string") {
      throw new Error("Invalid arguments");
    }
    renderComposition(dir, compositionId, (progress) => {
      mainWindow?.webContents.send(IPC_CHANNELS.projectRenderProgress, progress);
    });
  });

  ipcMain.handle(IPC_CHANNELS.projectListOutputs, async (_event, dir: unknown) => {
    if (typeof dir !== "string") throw new Error("Invalid directory");
    return listOutputs(dir);
  });

  ipcMain.handle(IPC_CHANNELS.projectListCompositions, async (_event, dir: unknown) => {
    if (typeof dir !== "string") throw new Error("Invalid directory");
    return listCompositions(dir);
  });

  ipcMain.handle(IPC_CHANNELS.projectReadSystemPrompt, async (_event, dir: unknown) => {
    if (typeof dir !== "string") throw new Error("Invalid directory");
    return readSystemPrompt(dir);
  });

  // ── Auth handlers ─────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.authLogin, async () => {
    return loginWithGoogle(apiBaseUrl, settingsStore);
  });

  ipcMain.handle(IPC_CHANNELS.authGetSession, async () => {
    return getSession(apiBaseUrl, settingsStore);
  });

  ipcMain.handle(IPC_CHANNELS.authLogout, async () => {
    return logout(settingsStore);
  });
}

async function bootstrap(): Promise<void> {
  settingsStore = new SettingsStore(path.join(app.getPath("userData"), "settings.json"));
  await settingsStore.init();

  registerIpcHandlers();
  mainWindow = createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
}

app.setName("Snug");

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(iconPath));
  }
  void bootstrap();
});

app.on("before-quit", () => {
  stopAllPlayers();
});

app.on("window-all-closed", () => {
  stopAllPlayers();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
