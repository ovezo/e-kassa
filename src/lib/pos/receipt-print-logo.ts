import { unikassaInvoke } from "@/lib/electron-api";
import type { ReceiptPrintPayload } from "./receipt-html";

type ReceiptLogoResponse =
  | { ok: true; dataUrl: string; widthPercent: number }
  | { ok: false };

/** Attach receipt logo from settings (embedded data URL for reliable thermal print). */
export async function attachReceiptLogo(
  payload: ReceiptPrintPayload,
): Promise<ReceiptPrintPayload> {
  try {
    const logo = await unikassaInvoke<ReceiptLogoResponse>("settings.getReceiptLogo");
    if (!logo.ok) return payload;
    return {
      ...payload,
      logo: { dataUrl: logo.dataUrl, widthPercent: logo.widthPercent },
    };
  } catch {
    return payload;
  }
}
