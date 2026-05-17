import { ikassirInvoke } from "@/lib/electron-api";
import type { ReceiptPrintPayload } from "./receipt-html";
import { logPrintEvent } from "./print-log";
import { printReceiptInBrowser, type PrintReceiptResult } from "./print-receipt-browser";

type ElectronPrintResult =
  | { ok: true; mode?: string }
  | { ok: false; error: string; dialogFallback?: boolean };

/** Silent print to the configured thermal printer (Electron only). */
export async function printReceiptSilent(
  payload: ReceiptPrintPayload,
): Promise<PrintReceiptResult> {
  if (typeof window !== "undefined" && window.ikassir) {
    void logPrintEvent("Renderer: silent print requested", {
      orderType: payload.orderType,
      lineCount: payload.lines.length,
      totalTmt: payload.totals.totalTmt,
    });

    const res = await ikassirInvoke<ElectronPrintResult>("print.receipt", payload);
    if (res.ok) {
      void logPrintEvent("Renderer: silent print finished", { mode: res.mode });
      return { ok: true };
    }

    void logPrintEvent("Renderer: silent print failed", { error: res.error });
    return { ok: false, error: res.error ?? "Print failed" };
  }

  return printReceiptInBrowser(payload);
}

/** Open the OS print dialog (pick any printer). Works in Electron and browser dev. */
export function printReceiptSystemDialog(
  payload: ReceiptPrintPayload,
): PrintReceiptResult {
  void logPrintEvent("Renderer: system print dialog requested", {
    orderType: payload.orderType,
    lineCount: payload.lines.length,
  });

  const res = printReceiptInBrowser(payload);
  if (res.ok) {
    void logPrintEvent("Renderer: system print dialog opened (browser fallback)");
  } else {
    void logPrintEvent("Renderer: system print dialog failed (browser fallback)", {
      error: res.error,
    });
  }
  return res;
}

/** @deprecated Use printReceiptSilent or printReceiptSystemDialog. */
export async function printReceipt(payload: ReceiptPrintPayload): Promise<PrintReceiptResult> {
  return printReceiptSilent(payload);
}
