import { ipcMain } from "electron";
import Store, { Schema } from "electron-store";

export type StoreType = {
	isCompact: boolean;
	approvedPlugins: string[];
};

const schema: Schema<StoreType> = {
	isCompact: {
		type: "boolean",
		default: false
	},
	approvedPlugins: {
		type: "array",
		default: []
	}
};

export const store = new Store<StoreType>({ schema });

ipcMain.on("store.get", (event, key) => {
	event.returnValue = store.get(key);
});

ipcMain.on("store.set", (_event, key, value) => {
	store.set(key, value);
});
