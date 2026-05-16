import { ipcMain } from "electron";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { printReceiptHtml } from "../services/print-receipt";
import { buildReceiptPrintHtml, type ReceiptPrintPayload } from "../../src/lib/pos/receipt-html";
import { dispatchIpc } from "../../src/lib/server/ipc/index";

const envelope = z.object({
  channel: z.string(),
  payload: z.unknown().optional(),
});

const printReceiptSchema = z.object({
  venueName: z.string(),
  orderId: z.string(),
  orderTypeLabel: z.string(),
  tableLabel: z.string().nullable(),
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
  }),
  servicePct: z.string(),
  deliveryFee: z.string(),
  labels: z.object({
    orderIdPrefix: z.string(),
    subtotal: z.string(),
    service: z.string(),
    delivery: z.string(),
    total: z.string(),
  }),
});

export function registerIpcHandlers(prisma: PrismaClient): void {
  ipcMain.removeHandler("ikassir");
  ipcMain.handle("ikassir", async (_evt, raw: unknown) => {
    const parsed = envelope.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Invalid IPC envelope");
    }

    if (parsed.data.channel === "print.receipt") {
      const body = printReceiptSchema.safeParse(parsed.data.payload);
      if (!body.success) return { ok: false as const, error: "Invalid print payload" };
      const html = buildReceiptPrintHtml(body.data as ReceiptPrintPayload);
      return printReceiptHtml(html);
    }

    return dispatchIpc(prisma, parsed.data.channel, parsed.data.payload);
  });
}
