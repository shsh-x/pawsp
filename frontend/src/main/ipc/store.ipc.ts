import { store } from "@main/store/store";
import { ipcMain } from "electron";

ipcMain.on("store.get", (event, key) => {
  event.returnValue = store.get(key);
});

ipcMain.on("store.set", (_event, key, value) => {
  store.set(key, value);
});
