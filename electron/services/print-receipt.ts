import { BrowserWindow, type PrinterInfo } from "electron";

const THERMAL_WIDTH_MICRONS = 80_000;
const THERMAL_HEIGHT_MICRONS = 297_000;

/** Prefer Xprinter 80mm; optional `preferred` overrides via settings (partial match). */
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

  const xprinter = printers.find((p) => /xprinter/i.test(p.name));
  if (xprinter) return xprinter.name;

  return printers.find((p) => p.isDefault)?.name;
}

/** Print HTML to the receipt printer without showing a dialog (silent). */
export function printReceiptHtml(
  html: string,
  preferredPrinterName?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
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

    const fail = (error: string) => {
      cleanup();
      resolve({ ok: false, error });
    };

    win.webContents.once("did-fail-load", () => {
      fail("Failed to load receipt for printing");
    });

    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    void win.loadURL(dataUrl).catch(() => fail("Failed to load receipt for printing"));

    win.webContents.once("did-finish-load", () => {
      const runPrint = async () => {
        try {
          const printers = await win.webContents.getPrintersAsync();
          const deviceName = pickReceiptPrinter(printers, preferredPrinterName);

          if (!deviceName) {
            fail(
              "No printer found. Connect the Xprinter and install its driver, or set the printer name in Admin → Settings.",
            );
            return;
          }

          win.webContents.print(
            {
              silent: true,
              deviceName,
              printBackground: false,
              margins: { marginType: "none" },
              pageSize: {
                width: THERMAL_WIDTH_MICRONS,
                height: THERMAL_HEIGHT_MICRONS,
              },
            },
            (success, failureReason) => {
              cleanup();
              if (success) resolve({ ok: true });
              else {
                resolve({
                  ok: false,
                  error:
                    failureReason ||
                    `Print failed (${deviceName}). Check that the printer is on and online.`,
                });
              }
            },
          );
        } catch (e) {
          fail(e instanceof Error ? e.message : "Print failed");
        }
      };

      setTimeout(() => void runPrint(), 200);
    });
  });
}
