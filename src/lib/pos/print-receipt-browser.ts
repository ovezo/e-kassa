import { buildReceiptPrintHtml, type ReceiptPrintPayload } from "./receipt-html";

export type PrintReceiptResult = { ok: true } | { ok: false; error: string };

function schedulePrint(target: Window): void {
  const run = () => {
    target.focus();
    target.print();
  };
  // Let layout/paint finish (Electron often prints blank if called immediately).
  if (typeof target.requestAnimationFrame === "function") {
    target.requestAnimationFrame(() => {
      target.requestAnimationFrame(run);
    });
  } else {
    setTimeout(run, 300);
  }
}

function printViaHiddenFrame(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    iframe.remove();
    throw new Error("Could not prepare print frame");
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    schedulePrint(win);
    setTimeout(() => iframe.remove(), 1000);
  }, 100);
}

/** Opens the system print dialog (printer or Save as PDF). */
export function printReceiptInBrowser(payload: ReceiptPrintPayload): PrintReceiptResult {
  try {
    const html = buildReceiptPrintHtml(payload);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const printWindow = window.open(url, "_blank");
    if (!printWindow) {
      URL.revokeObjectURL(url);
      try {
        printViaHiddenFrame(html);
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Allow pop-ups to print the receipt.",
        };
      }
    }

    const revoke = () => URL.revokeObjectURL(url);
    printWindow.addEventListener("beforeunload", revoke, { once: true });
    setTimeout(revoke, 120_000);

    let printed = false;
    const doPrint = () => {
      if (printed || printWindow.closed) return;
      printed = true;
      schedulePrint(printWindow);
    };
    printWindow.addEventListener("load", doPrint, { once: true });
    setTimeout(doPrint, 500);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Print failed" };
  }
}
