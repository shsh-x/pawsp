import { is } from "@electron-toolkit/utils";
import { appState } from "@main/state/app.state";
import { store } from "@main/store/store";
import { splashSendStatusUpdate } from "@main/windows/splash/splash.web-contents";
import { spawn } from "child_process";
import { app, dialog } from "electron";
import log from "electron-log";
import { existsSync } from "fs";
import { dirname, join } from "path";

export const startBackend = (): void => {
  const backendExecutableName =
    process.platform === "win32" ? "Paws.Host.exe" : "Paws.Host";

  const backendExecutable = is.dev
    ? join(
        __dirname,
        "..",
        "..",
        "..",
        "Paws.DotNet",
        "Paws.Host",
        "bin",
        "Debug",
        "net8.0",
        backendExecutableName,
      )
    : join(
        dirname(app.getPath("exe")),
        "resources",
        "Paws.Backend",
        backendExecutableName,
      );

  if (!existsSync(backendExecutable)) {
    const errorMsg =
      "Critical Error: The Paws backend executable could not be found " +
      `at the expected location: ${backendExecutable}.` +
      "The application cannot continue.";
    log.error(errorMsg);
    dialog.showErrorBox("Fatal Error", errorMsg);

    app.quit();
    return;
  }

  const approvedPlugins = store.get("approvedPlugins");
  const args = [JSON.stringify(approvedPlugins)];

  try {
    const backendProcess = spawn(backendExecutable, args);
    appState.set("backendProcess", backendProcess);

    let hostSignaledReady = false;
    backendProcess.stdout.on("data", (data) => {
      const logMessage = data.toString().trim();
      log.info(`[Backend]: ${logMessage}`);

      if (!hostSignaledReady && logMessage.includes("Application started.")) {
        hostSignaledReady = true;
        log.info("Backend signaled readiness.");
        splashSendStatusUpdate("Backend services started.");

        const mainWindow = appState.get("mainWindow");
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
        }
      }
    });

    backendProcess.stderr.on("data", (data) =>
      log.error(`Backend STDERR: ${data.toString().trim()}`),
    );

    backendProcess.on("error", (err) => {
      log.error("Failed to start C# Host process.", err);
      if (err instanceof Error) {
        dialog.showErrorBox(
          "Fatal Error",
          `An unexpected error occurred while trying to start the backend. Error: ${err.message}`,
        );
      }

      app.quit();
    });

    backendProcess.on("close", (code) => {
      log.info(`Backend process exited with code ${code}.`);
    });
  } catch (error) {
    log.error("Fatal error trying to spawn C# Host process:", error);

    if (error instanceof Error) {
      dialog.showErrorBox(
        "Fatal Error",
        `An unexpected error occurred while trying to start the backend. Error: ${error.message}`,
      );
    }

    app.quit();
  }
};

export const stopBackend = (): void => {
  const process = appState.get("backendProcess");

  if (process) {
    process.kill("SIGINT");
  }
};
