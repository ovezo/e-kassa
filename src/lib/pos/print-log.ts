import { ikassirInvoke } from "@/lib/electron-api";

/** Send print debug info to the main-process log file (no-op outside Electron). */
export async function logPrintEvent(message: string, detail?: unknown): Promise<void> {
  if (typeof window === "undefined" || !window.ikassir) return;
  try {
    await ikassirInvoke<{ ok: true }>("print.log", { message, detail });
  } catch {
    // Never block printing if logging fails.
  }
}
