import { app } from "electron";
import fs from "fs";
import path from "path";
import { appendBootLog, bootLogPath, logDirectory } from "./boot-log";

export function appendLog(message: string, detail?: unknown): void {
  appendBootLog(message, detail);
}

export function logFileLocation(): string {
  try {
    if (app.isReady()) {
      return path.join(app.getPath("userData"), "unikassa.log");
    }
  } catch {
    // fall through
  }
  return bootLogPath();
}

export function ensureLogDirectory(): void {
  const dir = app.isReady() ? app.getPath("userData") : logDirectory();
  fs.mkdirSync(dir, { recursive: true });
}
