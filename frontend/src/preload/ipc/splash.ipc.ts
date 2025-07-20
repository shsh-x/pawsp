import { ipcRenderer } from "electron";

export const splashIpc = {
  onStatusUpdate: (callback: (message: string) => void) =>
    ipcRenderer.on("splash.status-update", (_event, message) =>
      callback(message),
    ),
  onProgressUpdate: (
    callback: (progress: { percent: number; message?: string } | null) => void,
  ) =>
    ipcRenderer.on("splash.progress-update", (_event, progress) =>
      callback(progress),
    ),
};

export type SplashAPI = typeof splashIpc;
