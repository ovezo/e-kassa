import type { PrinterInfo } from "electron";
import { appendLog } from "../log-file";

/** Append a receipt-printer event to `%APPDATA%\\iKassir\\ikassir.log`. */
export function logPrint(message: string, detail?: unknown): void {
  appendLog(`[print] ${message}`, detail);
}

export function summarizePrinters(printers: PrinterInfo[]): Array<{
  name: string;
  isDefault: boolean;
  status: number;
  statusLabel: string;
  description?: string;
}> {
  return printers.map((p) => ({
    name: p.name,
    isDefault: p.isDefault,
    status: p.status,
    statusLabel:
      p.status === 0
        ? "idle"
        : p.status === 1
          ? "printing"
          : p.status === 2
            ? "warmup"
            : p.status === 3
              ? "offline_or_error"
              : `code_${p.status}`,
    description: p.description,
  }));
}
