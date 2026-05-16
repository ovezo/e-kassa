import { OrderType } from "@prisma/client";
import type { ReceiptPrintLabels, ReceiptPrintPayload } from "./receipt-html";
import type { ReceiptLine, ReceiptTotals } from "./receipt-print";

export function receiptPrintLabels(
  t: (key: string, params?: Record<string, string>) => string,
): ReceiptPrintLabels {
  return {
    kassir: t("pos.receipt.print.kassir"),
    musderi: t("pos.receipt.print.musderi"),
    bellik: t("pos.receipt.print.bellik"),
    wagt: t("pos.receipt.print.wagt"),
    sene: t("pos.receipt.print.sene"),
    colProduct: t("pos.receipt.print.colProduct"),
    colQty: t("pos.receipt.print.colQty"),
    colPrice: t("pos.receipt.print.colPrice"),
    colTotal: t("pos.receipt.print.colTotal"),
    grandTotal: t("pos.receipt.print.grandTotal"),
    eltipBerme: t("pos.receipt.print.eltipBerme"),
    hyzmat: t("pos.receipt.print.hyzmat"),
    footer: t("pos.receipt.print.footer"),
  };
}

export function receiptCustomerLabel(
  orderType: OrderType,
  orderTypeLabel: string,
  tableLabel: string | null,
): string {
  if (orderType === OrderType.TABLE && tableLabel) {
    return tableLabel;
  }
  return orderTypeLabel;
}

export function buildReceiptPrintPayload(input: {
  venueName: string;
  venueAddress: string;
  cashierName: string;
  customerLabel: string;
  note?: string;
  timestamp: string;
  orderType: OrderType;
  lines: ReceiptLine[];
  totals: ReceiptTotals;
  labels: ReceiptPrintLabels;
  servicePct: string;
}): ReceiptPrintPayload {
  return {
    venueName: input.venueName,
    venueAddress: input.venueAddress,
    cashierName: input.cashierName,
    customerLabel: input.customerLabel,
    note: input.note ?? "",
    timestamp: input.timestamp,
    orderType: input.orderType,
    lines: input.lines,
    totals: input.totals,
    labels: input.labels,
    servicePct: input.servicePct,
  };
}
