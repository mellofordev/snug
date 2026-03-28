import { contextBridge, ipcRenderer } from "electron";

import type { NativeApi } from "@acme/contracts";

import { IPC_CHANNELS } from "./ipcChannels";

const nativeApi: NativeApi = {
  agents: {
    detect: () => ipcRenderer.invoke(IPC_CHANNELS.agentsDetect)
  },
  prompt: {
    run: (input) => ipcRenderer.invoke(IPC_CHANNELS.promptRun, input),
    stop: (id) => ipcRenderer.invoke(IPC_CHANNELS.promptStop, id),
    onOutput: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, output: unknown) => {
        callback(output as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(IPC_CHANNELS.promptOutput, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.promptOutput, handler);
      };
    }
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.dialogSelectDirectory)
  },
  settings: {
    getBaseDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGetBaseDir),
    setBaseDirectory: (dir) => ipcRenderer.invoke(IPC_CHANNELS.settingsSetBaseDir, dir),
    getLastOpenedDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGetLastDir),
    setLastOpenedDirectory: (dir) => ipcRenderer.invoke(IPC_CHANNELS.settingsSetLastDir, dir)
  },
  fs: {
    createDirectory: (fullPath) => ipcRenderer.invoke(IPC_CHANNELS.fsCreateDirectory, fullPath)
  }
};

contextBridge.exposeInMainWorld("nativeApi", nativeApi);
