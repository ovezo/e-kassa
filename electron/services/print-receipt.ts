import { BrowserWindow, type PrinterInfo, type WebContentsPrintOptions } from "electron";
import { logPrint, summarizePrinters } from "./print-log";

const THERMAL_WIDTH_MICRONS = 80_000;
const THERMAL_HEIGHT_MICRONS = 297_000;

function printerScore(name: string): number {
  const n = name.toLowerCase();
  if (/xp[\s._-]*q80h/.test(n)) return 100;
  if (/xp[\s._-]*q80/.test(n)) return 90;
  if (/q80h/.test(n)) return 85;
  if (/xprinter/.test(n)) return 80;
  if (/80mm/.test(n)) return 70;
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

  let best: (typeof printers)[number] | undefined;
  let bestScore = 0;
  for (const p of printers) {
    const score = printerScore(p.name);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (best) return best.name;

  return printers.find((p) => p.isDefault)?.name;
}

function printOnce(
  webContents: Electron.WebContents,
  options: WebContentsPrintOptions,
  attempt: number,
  deviceName: string,
): Promise<{ success: boolean; failureReason?: string }> {
  return new Promise((resolve) => {
    webContents.print(options, (success, failureReason) => {
      if (!success) {
        logPrint("Silent print attempt failed", {
          attempt,
          deviceName,
          failureReason: failureReason || "(none)",
          options: {
            silent: options.silent,
            printBackground: options.printBackground,
            marginType: options.margins?.marginType,
            pageSize: options.pageSize,
          },
        });
      }
      resolve({ success, failureReason });
    });
  });
}

async function trySilentPrint(
  webContents: Electron.WebContents,
  deviceName: string,
): Promise<{ success: boolean; failureReason?: string }> {
  const attempts: WebContentsPrintOptions[] = [
    {
      silent: true,
      deviceName,
      printBackground: false,
      margins: { marginType: "none" },
      pageSize: { width: THERMAL_WIDTH_MICRONS, height: THERMAL_HEIGHT_MICRONS },
    },
    {
      silent: true,
      deviceName,
      printBackground: false,
      margins: { marginType: "default" },
    },
    {
      silent: true,
      deviceName,
      printBackground: true,
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
    if (success) return { success: true };
    lastReason = failureReason;
  }
  return { success: false, failureReason: lastReason };
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
      width: 320,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    const cleanup = () => {
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

    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    void win.loadURL(dataUrl).catch((e) => {
      fail("Failed to load receipt URL for printing", {
        error: e instanceof Error ? e.message : String(e),
        dataUrlLength: dataUrl.length,
      });
    });

    win.webContents.once("did-finish-load", () => {
      const runPrint = async () => {
        try {
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

          const { success, failureReason } = await trySilentPrint(win.webContents, deviceName);
          cleanup();
          if (success) {
            logPrint("Silent print succeeded", { deviceName });
            resolve({ ok: true, mode: "silent" });
            return;
          }

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

      setTimeout(() => void runPrint(), 250);
    });
  });
}
