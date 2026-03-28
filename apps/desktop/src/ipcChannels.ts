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
