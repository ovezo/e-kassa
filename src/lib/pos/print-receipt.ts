import { ikassirInvoke } from "@/lib/electron-api";
import type { ReceiptPrintPayload } from "./receipt-html";
import { printReceiptInBrowser, type PrintReceiptResult } from "./print-receipt-browser";

/** Silent print to Xprinter in Electron; browser print dialog as fallback in web dev. */
export async function printReceipt(payload: ReceiptPrintPayload): Promise<PrintReceiptResult> {
  if (typeof window !== "undefined" && window.ikassir) {
    return ikassirInvoke<PrintReceiptResult>("print.receipt", payload);
  }
  return printReceiptInBrowser(payload);
}
