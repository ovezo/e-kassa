import { ipcMain } from "electron";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { logPrint } from "../services/print-log";
import { printReceiptHtml } from "../services/print-receipt";
import { buildReceiptPrintHtml, type ReceiptPrintPayload } from "../../src/lib/pos/receipt-html";
import { dispatchIpc } from "../../src/lib/server/ipc/index";

const envelope = z.object({
  channel: z.string(),
  payload: z.unknown().optional(),
});

const printReceiptSchema = z.object({
  venueName: z.string(),
  venueAddress: z.string(),
  cashierName: z.string(),
  customerLabel: z.string(),
  note: z.string(),
  timestamp: z.string(),
  orderType: z.enum(["TABLE", "TAKEAWAY_PICKUP", "TAKEAWAY_DELIVERY"]),
  lines: z.array(
    z.object({
      id: z.string(),
      productName: z.string(),
      unitPriceTmt: z.number(),
      qty: z.number().int().positive(),
      lineTotalTmt: z.number(),
    }),
  ),
  totals: z.object({
    subtotalTmt: z.number(),
    serviceFeeTmt: z.number(),
    deliveryFeeTmt: z.number(),
    totalTmt: z.number(),
    serviceFeeWaived: z.boolean().optional(),
  }),
  labels: z.object({
    kassir: z.string(),
    musderi: z.string(),
    bellik: z.string(),
    wagt: z.string(),
    sene: z.string(),
    colProduct: z.string(),
    colQty: z.string(),
    colPrice: z.string(),
    colTotal: z.string(),
    grandTotal: z.string(),
    eltipBerme: z.string(),
    hyzmat: z.string(),
    footer: z.string(),
  }),
  servicePct: z.string(),
});

export function registerIpcHandlers(prisma: PrismaClient): void {
  ipcMain.removeHandler("ikassir");
  ipcMain.handle("ikassir", async (_evt, raw: unknown) => {
    const parsed = envelope.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Invalid IPC envelope");
    }

    if (parsed.data.channel === "print.log") {
      const body = z
        .object({
          message: z.string(),
          detail: z.unknown().optional(),
        })
        .safeParse(parsed.data.payload);
      if (body.success) logPrint(body.data.message, body.data.detail);
      return { ok: true as const };
    }

    if (parsed.data.channel === "print.receipt") {
      const body = printReceiptSchema.safeParse(parsed.data.payload);
      if (!body.success) {
        logPrint("Invalid print payload", { issues: body.error.flatten() });
        return { ok: false as const, error: "Invalid print payload", dialogFallback: true };
      }
      const printerRow = await prisma.setting.findUnique({
        where: { key: "receipt_printer_name" },
      });
      const html = buildReceiptPrintHtml(body.data as ReceiptPrintPayload);
      return printReceiptHtml(html, printerRow?.value);
    }

    return dispatchIpc(prisma, parsed.data.channel, parsed.data.payload);
  });
}
