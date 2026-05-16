import { OrderType } from "@prisma/client";
import { formatReceiptPrintDate, formatReceiptPrintTime } from "../format-datetime";
import { formatReceiptAmount } from "../format-money";
import type { ReceiptLine, ReceiptTotals } from "./receipt-print";

export type ReceiptPrintLabels = {
  kassir: string;
  musderi: string;
  bellik: string;
  wagt: string;
  sene: string;
  colProduct: string;
  colQty: string;
  colPrice: string;
  colTotal: string;
  grandTotal: string;
  eltipBerme: string;
  hyzmat: string;
  footer: string;
};

export type ReceiptPrintPayload = {
  venueName: string;
  venueAddress: string;
  cashierName: string;
  customerLabel: string;
  note: string;
  timestamp: string;
  orderType: OrderType;
  lines: ReceiptLine[];
  totals: ReceiptTotals;
  labels: ReceiptPrintLabels;
  servicePct: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function metaPair(label: string, value: string): string {
  return `<td class="meta-label">${escapeHtml(label)}</td><td class="meta-value">${escapeHtml(value)}</td>`;
}

function itemRow(name: string, qty: string, price: string, total: string): string {
  return `<tr>
    <td class="col-name">${escapeHtml(name)}</td>
    <td class="col-qty">${qty}</td>
    <td class="col-price">${escapeHtml(price)}</td>
    <td class="col-total">${escapeHtml(total)}</td>
  </tr>`;
}

function summaryRow(name: string, priceCol: string, totalTmt: number): string {
  return `<tr class="summary-row">
    <td class="col-name">${escapeHtml(name)}</td>
    <td class="col-qty"></td>
    <td class="col-price">${escapeHtml(priceCol)}</td>
    <td class="col-total">${escapeHtml(formatReceiptAmount(totalTmt))}</td>
  </tr>`;
}

/** Thermal-friendly HTML for browser / system print. */
export function buildReceiptPrintHtml(p: ReceiptPrintPayload): string {
  const itemsBody = p.lines
    .map((l) =>
      itemRow(
        l.productName.toUpperCase(),
        String(l.qty),
        formatReceiptAmount(l.unitPriceTmt),
        formatReceiptAmount(l.lineTotalTmt),
      ),
    )
    .join("");

  const feeRows: string[] = [];
  if (p.orderType === OrderType.TAKEAWAY_DELIVERY) {
    feeRows.push(summaryRow(p.labels.eltipBerme, "", p.totals.deliveryFeeTmt));
  }
  if (p.orderType === OrderType.TABLE) {
    feeRows.push(summaryRow(p.labels.hyzmat, `${p.servicePct}%`, p.totals.serviceFeeTmt));
  }

  const grandTotalRow = summaryRow(p.labels.grandTotal, "", p.totals.totalTmt);

  const bellikRow =
    p.note.trim().length > 0
      ? `<tr>${metaPair(p.labels.bellik, p.note)}<td colspan="2"></td></tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Courier New", Courier, monospace;
    font-size: 11px;
    line-height: 1.3;
    width: 72mm;
    max-width: 72mm;
    margin: 0;
    padding: 2mm 2mm 4mm;
    color: #000;
  }
  .center { text-align: center; }
  .venue {
    font-size: 14px;
    font-weight: bold;
    text-transform: uppercase;
    margin: 0 0 4px;
    line-height: 1.2;
  }
  .address {
    font-size: 11px;
    margin: 0 0 8px;
    line-height: 1.25;
  }
  table { width: 100%; border-collapse: collapse; }
  table.meta { margin-bottom: 8px; }
  table.meta td {
    vertical-align: top;
    padding: 1px 2px;
    font-size: 11px;
  }
  td.meta-label { white-space: nowrap; padding-right: 2px; width: 18%; }
  td.meta-value { font-weight: bold; width: 32%; }
  table.items {
    border: 1px solid #000;
    margin-bottom: 6px;
    font-size: 10px;
  }
  table.items th,
  table.items td {
    border: 1px solid #000;
    padding: 2px 3px;
    vertical-align: top;
  }
  table.items th {
    font-weight: bold;
    text-align: center;
    font-size: 9px;
    line-height: 1.15;
  }
  tr.summary-row td,
  tr:last-child td.col-name {
    font-weight: bold;
  }
  tr:last-child td.col-total {
    font-size: 12px;
    font-weight: bold;
  }
  td.col-name { text-align: left; width: 46%; }
  td.col-qty { text-align: center; width: 12%; }
  td.col-price { text-align: center; width: 20%; }
  td.col-total { text-align: right; width: 22%; white-space: nowrap; }
  .footer {
    margin-top: 12px;
    text-align: center;
    font-size: 16px;
    font-weight: bold;
    letter-spacing: 0.02em;
  }
</style>
</head>
<body>
  <div class="center venue">${escapeHtml(p.venueName)}</div>
  <div class="center address">${escapeHtml(p.venueAddress)}</div>

  <table class="meta">
    <tr>
      ${metaPair(p.labels.kassir, p.cashierName)}
      ${metaPair(p.labels.wagt, formatReceiptPrintTime(p.timestamp))}
    </tr>
    <tr>
      ${metaPair(p.labels.musderi, p.customerLabel)}
      ${metaPair(p.labels.sene, formatReceiptPrintDate(p.timestamp))}
    </tr>
    ${bellikRow}
  </table>

  <table class="items">
    <thead>
      <tr>
        <th>${escapeHtml(p.labels.colProduct)}</th>
        <th>${escapeHtml(p.labels.colQty)}</th>
        <th>${escapeHtml(p.labels.colPrice)}</th>
        <th>${escapeHtml(p.labels.colTotal)}</th>
      </tr>
    </thead>
    <tbody>
      ${itemsBody}
      ${feeRows.join("")}
      ${grandTotalRow}
    </tbody>
  </table>

  <div class="footer">${escapeHtml(p.labels.footer)}</div>
</body>
</html>`;
}
