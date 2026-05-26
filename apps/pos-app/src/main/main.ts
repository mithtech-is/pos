import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { registerDatabaseHandlers, closeDatabase } from "./db";
import { registerSyncHandlers, startSyncWorker, stopSyncWorker } from "./sync-worker";
import { registerPrinterHandlers } from "./printer";

const isDev = !app.isPackaged;

async function createWindow() {
  const preloadPath = path.join(__dirname, "../preload/preload.js");
  console.log("[main] __dirname        =", __dirname);
  console.log("[main] preload resolved =", preloadPath);
  console.log("[main] preload exists?  =", fs.existsSync(preloadPath));

  const win = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1024,
    minHeight: 720,
    title: "School Uniform POS",
    backgroundColor: "#0f172a",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Surface preload load errors that Electron normally swallows.
  win.webContents.on("preload-error", (_e, p, err) => {
    console.error("[main] preload-error at", p, "→", err);
  });
  // Mirror renderer console messages into our terminal so preload logs show up.
  win.webContents.on("console-message", (_e, level, msg, line, src) => {
    const label = ["debug", "info", "warn", "error"][level] ?? "log";
    console.log(`[renderer:${label}] ${msg} (${src}:${line})`);
  });

  if (isDev) {
    await win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "right" });
  } else {
    await win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  registerDatabaseHandlers(ipcMain);
  registerSyncHandlers(ipcMain);
  registerPrinterHandlers(ipcMain);
  await createWindow();
  startSyncWorker();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopSyncWorker();
  closeDatabase();
  if (process.platform !== "darwin") app.quit();
});
