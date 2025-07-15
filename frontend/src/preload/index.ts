import { electronAPI } from "@electron-toolkit/preload";
import { splashIpc } from "@main/ipc/splash.ipc";
import { storeIpc } from "@preload/ipc/store.ipc";
import { contextBridge } from "electron";

const api = {
	store: storeIpc,
	splash: splashIpc
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
