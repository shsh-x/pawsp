/// <reference types="vite/client" />

import { ElectronAPI } from "@preload/ipc/electron.ipc";
import { SplashAPI } from "@preload/ipc/splash.ipc";
import { StoreAPI } from "@preload/ipc/store.ipc";

declare global {
  interface Window {
    api: {
      electron: ElectronAPI;
      store: StoreAPI;
      splash: SplashAPI;
    };
  }
}
