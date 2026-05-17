import { ikassirInvoke } from "@/lib/electron-api";
import type { ReceiptPrintPayload } from "./receipt-html";
import { logPrintEvent } from "./print-log";
import { printReceiptInBrowser, type PrintReceiptResult } from "./print-receipt-browser";

type ElectronPrintResult =
  | { ok: true; mode?: string }
  | { ok: false; error: string; dialogFallback?: boolean };

/** Try silent XP-Q80H print in Electron; fall back to the system print dialog if that fails. */
export async function printReceipt(payload: ReceiptPrintPayload): Promise<PrintReceiptResult> {
  if (typeof window !== "undefined" && window.ikassir) {
    void logPrintEvent("Renderer: print requested", {
      orderType: payload.orderType,
      lineCount: payload.lines.length,
      totalTmt: payload.totals.totalTmt,
    });

    const res = await ikassirInvoke<ElectronPrintResult>("print.receipt", payload);
    if (res.ok) {
      void logPrintEvent("Renderer: print finished via silent path");
      return { ok: true };
    }

    void logPrintEvent("Renderer: silent print failed, opening print dialog", {
      error: res.error,
    });

    const dialog = printReceiptInBrowser(payload);
    if (dialog.ok) {
      void logPrintEvent("Renderer: print dialog opened successfully");
      return { ok: true };
    }

    void logPrintEvent("Renderer: print dialog path failed", { error: dialog.error });
    return {
      ok: false,
      error: dialog.error ?? res.error ?? "Print failed",
    };
  }

  return printReceiptInBrowser(payload);
}
