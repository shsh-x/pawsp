import { ChildProcessWithoutNullStreams } from "child_process";
import { BrowserWindow } from "electron";

interface State {
	mainWindow: BrowserWindow | null;
	splashWindow: BrowserWindow | null;
	backendProcess: ChildProcessWithoutNullStreams | null;
}

class AppState {
	private static instance: AppState;

	private readonly state: State;

	private constructor() {
		this.state = {
			mainWindow: null,
			splashWindow: null,
			backendProcess: null
		};
	}

	public static getInstance(): AppState {
		if (!AppState.instance) {
			AppState.instance = new AppState();
		}

		return AppState.instance;
	}

	public get<K extends keyof State>(key: K): State[K] {
		return this.state[key];
	}

	public set<K extends keyof State>(key: K, value: State[K]): void {
		this.state[key] = value;
	}
}

export const appState = AppState.getInstance();
