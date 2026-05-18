import { BrowserWindow, type PrinterInfo, type WebContentsPrintOptions } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import { logWindowsPrinterChecklist, summarizePrintersDetailed } from "./print-diagnostics";
import { logPrint } from "./print-log";

/**
 * 80mm thermal printer width
 * XP-80C / XP-Q80H printable width at 203 DPI
 */
const RECEIPT_WINDOW_WIDTH_PX = 576;
const RECEIPT_WINDOW_HEIGHT_PX = 1600;

const THERMAL_DPI = 203;

function printerScore(name: string): number {
  const n = name.toLowerCase();

  if (/xp[\s._-]*q80h/.test(n)) return 100;
  if (/xp[\s._-]*q80/.test(n)) return 95;
  if (/q80h/.test(n)) return 90;

  if (/xprinter/.test(n) && /80|q80/.test(n)) return 85;
  if (/xprinter/.test(n)) return 75;

  if (/80mm/.test(n)) return 70;

  if (/xp[\s._-]*80c/.test(n)) return 40;
  if (/80c/.test(n)) return 35;

  return 0;
}

/** Prefer XP-Q80H / Xprinter 80mm; optional preferred override */
export function pickReceiptPrinter(
  printers: PrinterInfo[],
  preferred?: string,
): string | undefined {
  const pref = preferred?.trim();

  if (pref) {
    const lower = pref.toLowerCase();

    const exact = printers.find(
      (p) => p.name.toLowerCase() === lower,
    );

    if (exact) return exact.name;

    const partial = printers.find(
      (p) => p.name.toLowerCase().includes(lower),
    );

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
    logPrint("Printer fallback to system default", {
      deviceName: fallback.name,
    });
  }

  return fallback?.name;
}

const PRINT_CALLBACK_TIMEOUT_MS = 12000;

function printOnce(
  webContents: Electron.WebContents,
  options: WebContentsPrintOptions,
  attempt: number,
  deviceName: string,
): Promise<{ success: boolean; failureReason?: string }> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (
      success: boolean,
      failureReason?: string,
    ) => {
      if (settled) return;

      settled = true;

      clearTimeout(timer);

      logPrint(
        success
          ? "Silent print attempt accepted by OS"
          : "Silent print attempt failed",
        {
          attempt,
          deviceName,
          success,
          failureReason: failureReason || "(none)",
          options: {
            silent: options.silent,
            printBackground: options.printBackground,
            marginType: options.margins?.marginType,
            dpi: options.dpi,
          },
        },
      );

      resolve({ success, failureReason });
    };

    const timer = setTimeout(() => {
      logWindowsPrinterChecklist(deviceName);

      finish(
        false,
        `Print timed out after ${PRINT_CALLBACK_TIMEOUT_MS}ms`,
      );
    }, PRINT_CALLBACK_TIMEOUT_MS);

    try {
      webContents.print(
        options,
        (success, failureReason) => {
          finish(success, failureReason);
        },
      );
    } catch (e) {
      finish(
        false,
        e instanceof Error ? e.message : String(e),
      );
    }
  });
}

async function trySilentPrint(
  webContents: Electron.WebContents,
  deviceName: string,
): Promise<{
  success: boolean;
  failureReason?: string;
  attempt?: number;
}> {
  const attempts: WebContentsPrintOptions[] = [
    {
      silent: true,
      deviceName,

      printBackground: true,
      color: false,

      margins: {
        marginType: "none",
      },

      pageSize: {
        width: 80000,
        height: 200000,
      },

      dpi: {
        horizontal: THERMAL_DPI,
        vertical: THERMAL_DPI,
      },

      scaleFactor: 98,
    },

    {
      silent: true,
      deviceName,

      printBackground: true,
      color: false,

      margins: {
        marginType: "printableArea",
      },

      pageSize: {
        width: 80000,
        height: 200000,
      },

      dpi: {
        horizontal: THERMAL_DPI,
        vertical: THERMAL_DPI,
      },

      scaleFactor: 98,
    },

    {
      silent: true,
      deviceName,

      printBackground: true,
      color: false,

      pageSize: {
        width: 80000,
        height: 200000,
      },

      scaleFactor: 98,
    },
  ];

  let lastReason: string | undefined;

  for (let i = 0; i < attempts.length; i++) {
    logPrint("Print attempt starting", {
      attempt: i + 1,
      options: attempts[i],
    });

    const { success, failureReason } =
      await printOnce(
        webContents,
        attempts[i]!,
        i + 1,
        deviceName,
      );

    if (success) {
      return {
        success: true,
        attempt: i + 1,
      };
    }

    lastReason = failureReason;
  }

  return {
    success: false,
    failureReason: lastReason,
  };
}

async function measureReceiptContent(
  webContents: Electron.WebContents,
): Promise<{
  scrollHeight: number;
  innerTextLength: number;
}> {
  try {
    return await webContents.executeJavaScript(`
      ({
        scrollHeight: document.body
          ? document.body.scrollHeight
          : 0,

        innerTextLength: document.body
          ? document.body.innerText.length
          : 0
      })
    `);
  } catch {
    return {
      scrollHeight: 0,
      innerTextLength: 0,
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function loadReceiptHtml(
  win: BrowserWindow,
  html: string,
): Promise<string | null> {
  const tmpPath = path.join(
    os.tmpdir(),
    `unikassa-receipt-${process.pid}-${Date.now()}.html`,
  );

  try {
    fs.writeFileSync(tmpPath, html, "utf8");

    await win.loadFile(tmpPath);

    return tmpPath;
  } catch (e) {
    logPrint("loadFile failed, trying data URL", {
      error:
        e instanceof Error
          ? e.message
          : String(e),
    });

    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(
      html,
    )}`;

    await win.loadURL(dataUrl);

    return null;
  }
}

export type PrintReceiptHtmlResult =
  | {
      ok: true;
      mode: "silent";
    }
  | {
      ok: false;
      error: string;
      dialogFallback: boolean;
    };

/** Silent thermal printing */
export function printReceiptHtml(
  html: string,
  preferredPrinterName?: string,
): Promise<PrintReceiptHtmlResult> {
  logPrint("Receipt print requested", {
    htmlLength: html.length,
    preferredPrinterName:
      preferredPrinterName?.trim() || "(auto)",
  });

  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,

      width: RECEIPT_WINDOW_WIDTH_PX,
      height: RECEIPT_WINDOW_HEIGHT_PX,

      backgroundColor: "#ffffff",

      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });

    /* =========================
       DEBUG WEB CONTENTS EVENTS
       ========================= */

    win.webContents.on("did-start-loading", () => {
      logPrint("did-start-loading");
    });

    win.webContents.on("dom-ready", () => {
      logPrint("dom-ready");
    });

    win.webContents.on("did-stop-loading", () => {
      logPrint("did-stop-loading");
    });

    win.webContents.on("did-finish-load", () => {
      logPrint("did-finish-load");
    });

    win.webContents.on(
      "did-fail-load",
      (_e, code, desc) => {
        logPrint("did-fail-load", {
          code,
          desc,
        });
      },
    );

    win.webContents.on(
      "render-process-gone",
      (_e, details) => {
        logPrint("render-process-gone", details);
      },
    );

    win.webContents.on("unresponsive", () => {
      logPrint("webContents unresponsive");
    });

    win.webContents.on("responsive", () => {
      logPrint("webContents responsive");
    });

    let tmpPath: string | null = null;

    const cleanup = () => {
      if (tmpPath) {
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          //
        }

        tmpPath = null;
      }

      if (!win.isDestroyed()) {
        win.destroy();
      }
    };

    const fail = (
      error: string,
      detail?: unknown,
    ) => {
      logPrint(error, detail);

      cleanup();

      resolve({
        ok: false,
        error,
        dialogFallback: true,
      });
    };

    const run = async () => {
      try {
        logPrint("About to load receipt HTML");

        tmpPath = await loadReceiptHtml(win, html);

        logPrint("loadReceiptHtml completed", {
          tmpPath,
          currentURL: win.webContents.getURL(),
        });

        logPrint("Waiting for render stabilization");

        await delay(1200);

        logPrint("Render stabilization completed");

        logPrint(
          "About to execute layout stabilization script",
        );

        await win.webContents.executeJavaScript(`
          new Promise((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(resolve);
            });
          });
        `);

        logPrint("Layout stabilization completed");

        const content = await measureReceiptContent(
          win.webContents,
        );

        logPrint(
          "Receipt rendered in print window",
          content,
        );

        if (content.innerTextLength < 8) {
          logPrint(
            "Warning: receipt body looks empty before print",
          );
        }

        const contentHeight =
          Math.ceil(content.scrollHeight) + 40;

        win.setContentSize(
          RECEIPT_WINDOW_WIDTH_PX,
          contentHeight,
        );

        await delay(800);

        logPrint("About to enumerate printers");

        const printers =
          await win.webContents.getPrintersAsync();

        logPrint("Printers enumerated", {
          count: printers.length,
          printers:
            summarizePrintersDetailed(printers),
        });

        const deviceName = pickReceiptPrinter(
          printers,
          preferredPrinterName,
        );

        if (!deviceName) {
          fail(
            "Receipt printer not found",
            {
              preferredPrinterName:
                preferredPrinterName?.trim() ||
                null,
            },
          );

          return;
        }

        logPrint("Using printer for silent print", {
          deviceName,
        });

        logPrint(
          "About to call trySilentPrint",
        );

        const {
          success,
          failureReason,
          attempt,
        } = await trySilentPrint(
          win.webContents,
          deviceName,
        );

        await delay(1000);

        if (success) {
          logPrint("Silent print job submitted", {
            deviceName,
            attempt,
          });

          cleanup();

          resolve({
            ok: true,
            mode: "silent",
          });

          return;
        }

        cleanup();

        const error =
          failureReason ||
          `Could not print to ${deviceName}`;

        logWindowsPrinterChecklist(deviceName);

        logPrint(
          "Silent print failed; use system dialog",
          {
            deviceName,
            failureReason:
              failureReason || "(none)",
          },
        );

        resolve({
          ok: false,
          error,
          dialogFallback: true,
        });
      } catch (e) {
        fail("Print threw an exception", {
          error:
            e instanceof Error
              ? e.message
              : String(e),

          stack:
            e instanceof Error
              ? e.stack
              : undefined,
        });
      }
    };

    void run();
  });
}