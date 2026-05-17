import type { PrinterInfo } from "electron";
import { logPrint } from "./print-log";

/** Human-readable hint for Electron `PrinterInfo.status` (Windows). */
export function printerStatusLabel(status: number): string {
  switch (status) {
    case 0:
      return "idle";
    case 1:
      return "printing";
    case 2:
      return "warmup";
    case 3:
      return "offline or error";
    case 4:
      return "unknown";
    default:
      return `code_${status}`;
  }
}

export function summarizePrintersDetailed(printers: PrinterInfo[]) {
  return printers.map((p) => ({
    name: p.name,
    displayName: "displayName" in p ? (p as { displayName?: string }).displayName : undefined,
    isDefault: p.isDefault,
    status: p.status,
    statusLabel: printerStatusLabel(p.status),
    description: p.description,
  }));
}

/** Logged when silent print times out — steps for staff on Windows. */
export function logWindowsPrinterChecklist(deviceName: string): void {
  logPrint("Silent print troubleshooting (Windows)", {
    deviceName,
    steps: [
      "Settings → Printers: XP-80C (or your receipt printer) status must be Ready, not Offline/Paused.",
      "Right-click the printer → Printer properties → Print Test Page. If that fails, fix USB/cable/driver first.",
      "Use the official Xprinter driver for XP-Q80H / XP-80C (not a generic text-only driver).",
      "Printer properties → Advanced: try Print directly to the printer; try disabling bidirectional support.",
      "Printer properties → Device Settings: paper width 80mm; no extra side margins if the driver offers them.",
      "In iKassir use the System button — if that prints but Print does not, the driver ignores silent/API jobs.",
      "Set receipt_printer_name in app settings to the exact name shown in Windows (e.g. XP-80C).",
      "Temporarily set XP-80C as the default Windows printer, then retry Print.",
    ],
  });
}
