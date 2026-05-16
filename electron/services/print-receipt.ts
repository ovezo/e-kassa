import { BrowserWindow } from "electron";

/** Print HTML to the OS default printer without showing a dialog (silent). */
export function printReceiptHtml(html: string): Promise<{ ok: true } | { ok: false; error: string }> {
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
      win.webContents.print(
        {
          silent: true,
          printBackground: false,
          deviceName: "",
        },
        (success, failureReason) => {
          cleanup();
          if (success) resolve({ ok: true });
          else resolve({ ok: false, error: failureReason || "Print failed" });
        },
      );
    });
  });
}
