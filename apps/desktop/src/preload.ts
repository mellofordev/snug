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
    createDirectory: (fullPath) => ipcRenderer.invoke(IPC_CHANNELS.fsCreateDirectory, fullPath),
    renamePath: (from, to) => ipcRenderer.invoke(IPC_CHANNELS.fsRenamePath, from, to),
    removePath: (fullPath) => ipcRenderer.invoke(IPC_CHANNELS.fsRemovePath, fullPath)
  },
  shell: {
    openPath: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.shellOpenPath, filePath),
    revealPath: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.shellRevealPath, filePath)
  },
  project: {
    init: (dir) => ipcRenderer.invoke(IPC_CHANNELS.projectInit, dir),
    startPlayer: (dir) => ipcRenderer.invoke(IPC_CHANNELS.projectStartPlayer, dir),
    stopPlayer: (dir) => ipcRenderer.invoke(IPC_CHANNELS.projectStopPlayer, dir),
    render: (dir, compositionId) => ipcRenderer.invoke(IPC_CHANNELS.projectRender, dir, compositionId),
    onRenderProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: unknown) => {
        callback(progress as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(IPC_CHANNELS.projectRenderProgress, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.projectRenderProgress, handler);
      };
    },
    listOutputs: (dir) => ipcRenderer.invoke(IPC_CHANNELS.projectListOutputs, dir),
    listCompositions: (dir) => ipcRenderer.invoke(IPC_CHANNELS.projectListCompositions, dir),
    readSystemPrompt: (dir) => ipcRenderer.invoke(IPC_CHANNELS.projectReadSystemPrompt, dir)
  },
  auth: {
    login: () => ipcRenderer.invoke(IPC_CHANNELS.authLogin),
    getSession: () => ipcRenderer.invoke(IPC_CHANNELS.authGetSession),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.authLogout)
  }
};

contextBridge.exposeInMainWorld("nativeApi", nativeApi);
