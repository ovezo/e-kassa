import fs from "fs";
import os from "os";
import path from "path";

/** Log directory — matches Electron `app.getPath("userData")` for productName iKassir. */
export function logDirectory(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) {
      return path.join(appData, "iKassir");
    }
    return path.join(os.homedir(), "AppData", "Roaming", "iKassir");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "iKassir");
  }
  return path.join(os.homedir(), ".config", "iKassir");
}

/** Writes before Electron `app.whenReady` (no dependency on `app.getPath`). */
export function appendBootLog(message: string, detail?: unknown): void {
  const dir = logDirectory();
  const line = `[${new Date().toISOString()}] ${message}${
    detail !== undefined ? ` ${formatDetail(detail)}` : ""
  }\n`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "ikassir.log"), line, "utf8");
  } catch (e) {
    console.error("[iKassir] boot log write failed", e);
  }
  console.error("[iKassir]", message, detail ?? "");
}

function formatDetail(detail: unknown): string {
  if (detail instanceof Error) {
    return detail.stack ?? detail.message;
  }
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export function bootLogPath(): string {
  return path.join(logDirectory(), "ikassir.log");
}

appendBootLog("boot-log module loaded", {
  pid: process.pid,
  execPath: process.execPath,
  cwd: process.cwd(),
});
