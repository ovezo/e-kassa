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

export type ReceiptPrintLogo = {
  dataUrl: string;
  widthPercent: number;
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
  logo?: ReceiptPrintLogo;
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
  if (
    p.orderType === OrderType.TABLE &&
    p.totals.serviceFeeTmt > 0 &&
    !p.totals.serviceFeeWaived
  ) {
    feeRows.push(summaryRow(p.labels.hyzmat, `${p.servicePct}%`, p.totals.serviceFeeTmt));
  }

  const grandTotalRow = summaryRow(p.labels.grandTotal, "", p.totals.totalTmt);

  const bellikRow =
    p.note.trim().length > 0
      ? `<tr>${metaPair(p.labels.bellik, p.note)}<td colspan="2"></td></tr>`
      : "";

  const logoBlock = p.logo
    ? `<div class="receipt-logo-wrap"><img class="receipt-logo" src="${p.logo.dataUrl}" alt="" style="width:${p.logo.widthPercent}%;height:auto" /></div>`
    : "";

  const customerValue =
    p.orderType === OrderType.TABLE ? p.customerLabel.trim() : "";
  const dateLabel = formatReceiptPrintDate(p.timestamp);
  const metaCustomerRow = `<tr>
      ${metaPair(p.labels.musderi, customerValue)}
      ${metaPair(p.labels.sene, dateLabel)}
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>
  * { box-sizing: border-box; }
   @page {
    size: 80mm auto;
    margin: 0;
  }
  body {
    font-family: Calibri, "Segoe UI", Arial, Helvetica, sans-serif;
    font-size: 12px;
    line-height: 1.35;
    width: 80mm;
    max-width: 80mm;
    margin: 0;
    padding: 0 0 3mm 0;
    color: #000;
    overflow: visible;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .center { text-align: center; }
  .receipt-logo-wrap {
    text-align: center;
    margin: 0 0 6px;
    line-height: 0;
  }
  .receipt-logo {
    display: block;
    margin: 0 auto;
    height: auto;
    max-width: 100%;
  }
  .venue {
    font-size: 15px;
    font-weight: bold;
    text-transform: uppercase;
    margin: 0 0 3px;
    line-height: 1.2;
  }
  .address {
    font-size: 12px;
    margin: 0 0 6px;
    line-height: 1.3;
  }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.meta { margin-bottom: 6px; }
  table.meta td {
    vertical-align: top;
    padding: 0;
    font-size: 12px;
  }
  td.meta-label { white-space: nowrap; width: 18%; }
  td.meta-value { font-weight: bold; width: 32%; }
  table.items {
    width: 100%;
    max-width: 100%;
    border: 1px solid #000;
    margin: 0 0 6px 0;
    font-size: 12px;
  }
  table.items th,
  table.items td {
    border: 1px solid #000;
    padding: 0;
    vertical-align: top;
  }
  table.items th {
    font-weight: bold;
    text-align: center;
    font-size: 12px;
    line-height: 1.15;
  }
  tr.summary-row td,
  tr:last-child td.col-name {
    font-weight: bold;
  }
  tr:last-child td.col-total {
    font-size: 15px;
    font-weight: bold;
  }
  td.col-name,
  th.col-name {
    text-align: left;
    width: 48%;
    line-height: 1.1;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  td.col-qty,
  th.col-qty {
    text-align: center;
    width: 8%;
    white-space: nowrap;
    line-height: 1.15;
    font-size: 11px;
  }
  td.col-price,
  th.col-price {
    text-align: center;
    width: 20%;
    white-space: nowrap;
    line-height: 1.15;
    font-size: 11px;
  }
  td.col-total,
  th.col-total {
    text-align: right;
    width: 24%;
    white-space: nowrap;
    line-height: 1.15;
    font-size: 11px;
    padding-right: 1px;
  }
  .footer {
    margin-top: 10px;
    text-align: center;
    font-size: 15px;
    font-weight: bold;
    letter-spacing: 0.02em;
  }
  @media print {
    body {
      width: 80mm;
      max-width: 80mm;
      font-size: 12px;
      padding: 0 0 3mm 0;
    }
  }
</style>
</head>
<body>
  ${logoBlock}
  <div class="center venue">${escapeHtml(p.venueName)}</div>
  <div class="center address">${escapeHtml(p.venueAddress)}</div>

  <table class="meta">
    <tr>
      ${metaPair(p.labels.kassir, p.cashierName)}
      ${metaPair(p.labels.wagt, formatReceiptPrintTime(p.timestamp))}
    </tr>
    ${metaCustomerRow}
    ${bellikRow}
  </table>

  <table class="items">
    <thead>
      <tr>
        <th class="col-name">${escapeHtml(p.labels.colProduct)}</th>
        <th class="col-qty">${escapeHtml(p.labels.colQty)}</th>
        <th class="col-price">${escapeHtml(p.labels.colPrice)}</th>
        <th class="col-total">${escapeHtml(p.labels.colTotal)}</th>
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
