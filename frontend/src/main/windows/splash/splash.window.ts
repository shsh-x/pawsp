import { is } from "@electron-toolkit/utils";
import { appState } from "@main/state/app.state";
import { BrowserWindow } from "electron";
import { join } from "path";

export const createSplashWindow = (): BrowserWindow => {
  const splashWindow = new BrowserWindow({
    width: 360,
    height: 400,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: is.dev,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  appState.set("splashWindow", splashWindow);

  splashWindow.on("ready-to-show", () => {
    splashWindow.show();
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    splashWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/splash.html`);
    splashWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    splashWindow.loadFile(join(__dirname, "../renderer/splash.html"));
  }

  return splashWindow;
};
