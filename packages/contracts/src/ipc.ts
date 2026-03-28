import type { Agent, PromptInput, PromptOutput } from "./agent";

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
  fsCreateDirectory: "fs:create-directory"
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
}
