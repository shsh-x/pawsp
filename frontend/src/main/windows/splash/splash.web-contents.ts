import { appState } from "@main/state/app.state";

export const splashSendStatusUpdate = (message: string): void => {
  const splashWindow = appState.get("splashWindow");

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send("splash.status-update", message);
  }
};

export const splashSendProgressUpdate = (
  progress: { percent: number; message?: string } | null,
): void => {
  const splashWindow = appState.get("splashWindow");

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send("splash.progress-update", progress);
  }
};
