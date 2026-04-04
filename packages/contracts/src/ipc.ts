import type {
  Agent,
  CompositionFile,
  PromptInput,
  PromptOutput,
  RenderHistoryItem,
  RenderProgress
} from "./agent";
import type { User } from "./auth";
import type { UpdateStatus } from "./update";

export const IPC_CHANNELS = {
  agentsDetect: "agents:detect",
  promptRun: "prompt:run",
  promptStop: "prompt:stop",
  promptOutput: "prompt:output",
  dialogSelectDirectory: "dialog:select-directory",
  settingsGetBaseDir: "settings:get-base-dir",
  settingsSetBaseDir: "settings:set-base-dir",
  settingsGetLastDir: "settings:get-last-dir",
  settingsSetLastDir: "settings:set-last-dir",
  fsCreateDirectory: "fs:create-directory",
  fsRenamePath: "fs:rename-path",
  fsRemovePath: "fs:remove-path",
  shellOpenPath: "shell:open-path",
  shellRevealPath: "shell:reveal-path",
  windowSetBackgroundColor: "window:set-background-color",
  projectInit: "project:init",
  projectStartPlayer: "project:start-player",
  projectStopPlayer: "project:stop-player",
  projectRender: "project:render",
  projectRenderProgress: "project:render-progress",
  projectListOutputs: "project:list-outputs",
  projectListCompositions: "project:list-compositions",
  projectReadSystemPrompt: "project:read-system-prompt",
  authLogin: "auth:login",
  authGetSession: "auth:get-session",
  authLogout: "auth:logout",
  appCheckUpdate: "app:check-update",
  appDownloadUpdate: "app:download-update",
  appInstallUpdate: "app:install-update",
  appUpdateStatus: "app:update-status"
} as const;

export interface NativeApi {
  agents: {
    detect: () => Promise<Agent[]>;
  };
  prompt: {
    run: (input: PromptInput) => Promise<PromptOutput>;
    stop: (id: string) => Promise<void>;
    onOutput: (callback: (output: PromptOutput) => void) => () => void;
  };
  dialog: {
    selectDirectory: () => Promise<string | null>;
  };
  settings: {
    getBaseDirectory: () => Promise<string | null>;
    setBaseDirectory: (dir: string) => Promise<void>;
    getLastOpenedDirectory: () => Promise<string | null>;
    setLastOpenedDirectory: (dir: string) => Promise<void>;
  };
  fs: {
    createDirectory: (fullPath: string) => Promise<string>;
    renamePath: (from: string, to: string) => Promise<string>;
    removePath: (fullPath: string) => Promise<void>;
  };
  shell: {
    /** Opens a file with the OS default app (e.g. QuickTime for video on macOS). */
    openPath: (filePath: string) => Promise<void>;
    revealPath: (filePath: string) => Promise<void>;
  };
  window: {
    setBackgroundColor: (color: string) => Promise<void>;
  };
  project: {
    init: (dir: string) => Promise<{ success: boolean; error?: string }>;
    startPlayer: (dir: string) => Promise<{ url: string }>;
    stopPlayer: (dir: string) => Promise<void>;
    render: (dir: string, compositionId: string) => Promise<void>;
    onRenderProgress: (callback: (progress: RenderProgress) => void) => () => void;
    listOutputs: (dir: string) => Promise<RenderHistoryItem[]>;
    listCompositions: (dir: string) => Promise<CompositionFile[]>;
    readSystemPrompt: (dir: string) => Promise<string>;
  };
  auth: {
    login: () => Promise<User>;
    getSession: () => Promise<User | null>;
    logout: () => Promise<void>;
  };
  app: {
    checkUpdate: () => Promise<void>;
    downloadUpdate: () => Promise<void>;
    installUpdate: () => Promise<void>;
    onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
  };
}
