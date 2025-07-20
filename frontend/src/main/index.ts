import "@main/ipc/register-ipc";

import { electronApp } from "@electron-toolkit/utils";
import { startBackend, stopBackend } from "@main/backend/backend";
import { createMainWindow } from "@main/windows/main/main.window";
import { createSplashWindow } from "@main/windows/splash/splash.window";
import { app, BrowserWindow } from "electron";

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("org.paws.Paws");

  const splashWindow = createSplashWindow();
  createMainWindow(splashWindow);

  startBackend();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0)
      createMainWindow(splashWindow);
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopBackend();
});
