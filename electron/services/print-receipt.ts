import { BrowserWindow, type PrinterInfo, type WebContentsPrintOptions } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import { logPrint, summarizePrinters } from "./print-log";

/** ~80mm at 96 DPI — match receipt CSS width so layout paints before print. */
const RECEIPT_WINDOW_WIDTH_PX = 302;
const RECEIPT_WINDOW_HEIGHT_PX = 1200;

const THERMAL_WIDTH_MICRONS = 80_000;
const THERMAL_HEIGHT_MICRONS = 297_000;
const THERMAL_DPI = 203;

function printerScore(name: string): number {
  const n = name.toLowerCase();
  if (/xp[\s._-]*q80h/.test(n)) return 100;
  if (/xp[\s._-]*q80/.test(n)) return 95;
  if (/q80h/.test(n)) return 90;
  if (/xprinter/.test(n) && /80|q80/.test(n)) return 85;
  if (/xprinter/.test(n)) return 75;
  if (/80mm/.test(n)) return 70;
  // Generic 80C label driver — only if nothing better matched
  if (/xp[\s._-]*80c/.test(n)) return 40;
  if (/80c/.test(n)) return 35;
  return 0;
}

/** Prefer XP-Q80H / Xprinter 80mm; optional `preferred` overrides via settings (partial match). */
export function pickReceiptPrinter(
  printers: PrinterInfo[],
  preferred?: string,
): string | undefined {
  const pref = preferred?.trim();
  if (pref) {
    const lower = pref.toLowerCase();
    const exact = printers.find((p) => p.name.toLowerCase() === lower);
    if (exact) return exact.name;
    const partial = printers.find((p) => p.name.toLowerCase().includes(lower));
    if (partial) return partial.name;
  }

  let best: PrinterInfo | undefined;
  let bestScore = 0;
  for (const p of printers) {
    const score = printerScore(p.name);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (best && bestScore > 0) {
    logPrint("Printer auto-selected by score", {
      deviceName: best.name,
      score: bestScore,
    });
    return best.name;
  }

  const fallback = printers.find((p) => p.isDefault);
  if (fallback) {
    logPrint("Printer fallback to system default", { deviceName: fallback.name });
  }
  return fallback?.name;
}

const PRINT_CALLBACK_TIMEOUT_MS = 12_000;

function printOnce(
  webContents: Electron.WebContents,
  options: WebContentsPrintOptions,
  attempt: number,
  deviceName: string,
): Promise<{ success: boolean; failureReason?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (success: boolean, failureReason?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      logPrint(
        success ? "Silent print attempt accepted by OS" : "Silent print attempt failed",
        {
          attempt,
          deviceName,
          success,
          failureReason: failureReason || "(none)",
          options: {
            silent: options.silent,
            printBackground: options.printBackground,
            marginType: options.margins?.marginType,
            pageSize: options.pageSize,
            dpi: options.dpi,
          },
        },
      );
      resolve({ success, failureReason });
    };

    const timer = setTimeout(() => {
      finish(
        false,
        `Print timed out after ${PRINT_CALLBACK_TIMEOUT_MS}ms (driver did not respond)`,
      );
    }, PRINT_CALLBACK_TIMEOUT_MS);

    try {
      webContents.print(options, (success, failureReason) => {
        finish(success, failureReason);
      });
    } catch (e) {
      finish(false, e instanceof Error ? e.message : String(e));
    }
  });
}

async function trySilentPrint(
  webContents: Electron.WebContents,
  deviceName: string,
): Promise<{ success: boolean; failureReason?: string; attempt?: number }> {
  const attempts: WebContentsPrintOptions[] = [
    {
      silent: true,
      deviceName,
      printBackground: true,
      margins: { marginType: "none" },
      dpi: { horizontal: THERMAL_DPI, vertical: THERMAL_DPI },
    },
    {
      silent: true,
      deviceName,
      printBackground: true,
      margins: { marginType: "none" },
    },
    {
      silent: true,
      deviceName,
      printBackground: true,
      margins: { marginType: "default" },
      pageSize: { width: THERMAL_WIDTH_MICRONS, height: THERMAL_HEIGHT_MICRONS },
    },
  ];

  let lastReason: string | undefined;
  for (let i = 0; i < attempts.length; i++) {
    const { success, failureReason } = await printOnce(
      webContents,
      attempts[i]!,
      i + 1,
      deviceName,
    );
    if (success) return { success: true, attempt: i + 1 };
    lastReason = failureReason;
  }
  return { success: false, failureReason: lastReason };
}

async function measureReceiptContent(webContents: Electron.WebContents): Promise<{
  scrollHeight: number;
  innerTextLength: number;
}> {
  try {
    return await webContents.executeJavaScript(`({
      scrollHeight: document.body ? document.body.scrollHeight : 0,
      innerTextLength: document.body ? document.body.innerText.length : 0,
    })`);
  } catch {
    return { scrollHeight: 0, innerTextLength: 0 };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadReceiptHtml(win: BrowserWindow, html: string): Promise<string | null> {
  const tmpPath = path.join(os.tmpdir(), `ikassir-receipt-${process.pid}-${Date.now()}.html`);
  try {
    fs.writeFileSync(tmpPath, html, "utf8");
    await win.loadFile(tmpPath);
    return tmpPath;
  } catch (e) {
    logPrint("loadFile failed, trying data URL", {
      error: e instanceof Error ? e.message : String(e),
    });
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    await win.loadURL(dataUrl);
    return null;
  }
}

export type PrintReceiptHtmlResult =
  | { ok: true; mode: "silent" }
  | { ok: false; error: string; dialogFallback: true };

/** Print HTML silently to the receipt printer; caller should open the print dialog on failure. */
export function printReceiptHtml(
  html: string,
  preferredPrinterName?: string,
): Promise<PrintReceiptHtmlResult> {
  logPrint("Receipt print requested", {
    htmlLength: html.length,
    preferredPrinterName: preferredPrinterName?.trim() || "(auto)",
  });

  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      width: RECEIPT_WINDOW_WIDTH_PX,
      height: RECEIPT_WINDOW_HEIGHT_PX,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });

    let tmpPath: string | null = null;

    const cleanup = () => {
      if (tmpPath) {
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          // ignore
        }
        tmpPath = null;
      }
      if (!win.isDestroyed()) win.destroy();
    };

    const fail = (error: string, detail?: unknown) => {
      logPrint(error, detail);
      cleanup();
      resolve({ ok: false, error, dialogFallback: true });
    };

    win.webContents.once("did-fail-load", (_event, code, desc) => {
      fail("Failed to load receipt HTML for printing", { code, desc });
    });

    const run = async () => {
      try {
        tmpPath = await loadReceiptHtml(win, html);
        await delay(400);

        const content = await measureReceiptContent(win.webContents);
        logPrint("Receipt rendered in print window", content);
        if (content.innerTextLength < 8) {
          logPrint("Warning: receipt body looks empty before print");
        }

        const printers = await win.webContents.getPrintersAsync();
        logPrint("Printers enumerated", {
          count: printers.length,
          printers: summarizePrinters(printers),
        });

        const deviceName = pickReceiptPrinter(printers, preferredPrinterName);

        if (!deviceName) {
          fail(
            "Receipt printer not found (looked for XP-Q80H / Xprinter). Opening print dialog.",
            { preferredPrinterName: preferredPrinterName?.trim() || null },
          );
          return;
        }

        logPrint("Using printer for silent print", {
          deviceName,
          preferredPrinterName: preferredPrinterName?.trim() || null,
        });

        const { success, failureReason, attempt } = await trySilentPrint(
          win.webContents,
          deviceName,
        );

        await delay(800);

        if (success) {
          logPrint("Silent print job submitted", { deviceName, attempt });
          cleanup();
          resolve({ ok: true, mode: "silent" });
          return;
        }

        cleanup();
        const error =
          failureReason ||
          `Could not print to ${deviceName}. Opening print dialog.`;
        logPrint("Silent print failed; dialog fallback expected", {
          deviceName,
          failureReason: failureReason || "(none)",
        });
        resolve({
          ok: false,
          error,
          dialogFallback: true,
        });
      } catch (e) {
        fail("Print threw an exception", {
          error: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
        });
      }
    };

    void run();
  });
}
