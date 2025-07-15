/// <reference types="vite/client" />

import { StoreAPI } from "@preload/ipc/store.electron-api";

import { SplashAPI } from "../main/api/splash/splash";

declare global {
	interface Window {
		api: {
			splash: SplashAPI;
			store: StoreAPI;
		};
	}
}
