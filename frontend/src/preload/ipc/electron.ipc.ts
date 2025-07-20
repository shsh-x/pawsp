import { ipcRenderer } from "electron";

export const electronIpc = {
  closeApp: () => ipcRenderer.send("electron.close-app"),
  minimizeWindow: () => ipcRenderer.send("electron.minimize-window"),
};

export type ElectronAPI = typeof electronIpc;
