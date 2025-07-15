import { StoreType } from "@main/store/store";
import { ipcRenderer } from "electron";

export const storeIpc = {
	get<T extends keyof StoreType>(key: T): StoreType[T] {
		return ipcRenderer.sendSync("store.get", key);
	},
	set<T extends keyof StoreType>(property: T, value: StoreType[T]): void {
		ipcRenderer.send("store.set", property, value);
	}
};

export type StoreAPI = typeof storeIpc;
