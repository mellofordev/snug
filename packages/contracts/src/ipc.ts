import type {
  Agent,
  CompositionFile,
  PromptInput,
  PromptOutput,
  RenderHistoryItem,
  RenderProgress
} from "./agent";

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
  projectInit: "project:init",
  projectStartPlayer: "project:start-player",
  projectStopPlayer: "project:stop-player",
  projectRender: "project:render",
  projectRenderProgress: "project:render-progress",
  projectListOutputs: "project:list-outputs",
  projectListCompositions: "project:list-compositions",
  projectReadSystemPrompt: "project:read-system-prompt"
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
}
