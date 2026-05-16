import { OrderType } from "@prisma/client";
import { formatTmt } from "../format-money";
import type { ReceiptLine, ReceiptTotals } from "./receipt-print";

export type ReceiptPrintLabels = {
  orderIdPrefix: string;
  subtotal: string;
  service: string;
  delivery: string;
  total: string;
};

export type ReceiptPrintPayload = {
  venueName: string;
  orderId: string;
  orderTypeLabel: string;
  tableLabel: string | null;
  timestamp: string;
  orderType: OrderType;
  lines: ReceiptLine[];
  totals: ReceiptTotals;
  servicePct: string;
  deliveryFee: string;
  labels: ReceiptPrintLabels;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Thermal-friendly HTML for silent system print (Electron). */
export function buildReceiptPrintHtml(p: ReceiptPrintPayload): string {
  const linesHtml = p.lines
    .map(
      (l) =>
        `<tr><td class="name">${escapeHtml(l.productName)} ×${l.qty}</td><td class="amt">${escapeHtml(formatTmt(l.lineTotalTmt))}</td></tr>`,
    )
    .join("");

  const meta = escapeHtml(p.orderTypeLabel) + (p.tableLabel ? ` · ${escapeHtml(p.tableLabel)}` : "");

  let totalsHtml = "";
  if (p.orderType !== OrderType.TAKEAWAY_PICKUP) {
    totalsHtml += `<tr><td>${escapeHtml(p.labels.subtotal)}</td><td class="amt">${escapeHtml(formatTmt(p.totals.subtotalTmt))}</td></tr>`;
  }
  if (p.orderType === OrderType.TABLE && p.totals.serviceFeeTmt > 0) {
    totalsHtml += `<tr><td>${escapeHtml(p.labels.service)}</td><td class="amt">${escapeHtml(formatTmt(p.totals.serviceFeeTmt))}</td></tr>`;
  }
  if (p.orderType === OrderType.TAKEAWAY_DELIVERY && p.totals.deliveryFeeTmt > 0) {
    totalsHtml += `<tr><td>${escapeHtml(p.labels.delivery)}</td><td class="amt">${escapeHtml(formatTmt(p.totals.deliveryFeeTmt))}</td></tr>`;
  }
  totalsHtml += `<tr class="total"><td>${escapeHtml(p.labels.total)}</td><td class="amt">${escapeHtml(formatTmt(p.totals.totalTmt))}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Courier New", Courier, monospace; font-size: 12px; line-height: 1.35; width: 72mm; max-width: 72mm; margin: 0; padding: 2mm 3mm; color: #000; }
  .center { text-align: center; }
  .venue { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
  .muted { color: #333; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td { vertical-align: top; padding: 2px 0; }
  td.name { padding-right: 4px; }
  td.amt { text-align: right; white-space: nowrap; }
  .items { border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px; }
  .totals { border-top: 1px solid #000; padding-top: 4px; }
  tr.total td { font-weight: bold; font-size: 14px; padding-top: 4px; border-top: 1px solid #000; }
</style>
</head>
<body>
  <div class="center venue">${escapeHtml(p.venueName)}</div>
  <div class="center muted">${escapeHtml(new Date(p.timestamp).toLocaleString())}</div>
  <div class="center muted">${escapeHtml(p.labels.orderIdPrefix)} ${escapeHtml(p.orderId.slice(0, 8))}…</div>
  <div class="center muted">${meta}</div>
  <table class="items">${linesHtml}</table>
  <table class="totals">${totalsHtml}</table>
</body>
</html>`;
}
