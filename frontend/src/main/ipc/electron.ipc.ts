import { appState } from "@main/state/app.state";
import { app, ipcMain } from "electron";

ipcMain.on("electron.close-app", () => {
  app.quit();
});

ipcMain.on("electron.minimize-window", () => {
  const mainWindow = appState.get("mainWindow");

  if (mainWindow) {
    mainWindow.minimize();
  }
});
