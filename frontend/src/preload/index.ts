import { electronAPI } from "@electron-toolkit/preload";
import { electronIpc } from "@preload/ipc/electron.ipc";
import { splashIpc } from "@preload/ipc/splash.ipc";
import { storeIpc } from "@preload/ipc/store.ipc";
import { contextBridge } from "electron";

const api = {
  electron: electronIpc,
  store: storeIpc,
  splash: splashIpc,
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.api = api;
}
