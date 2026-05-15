import { OrderType } from "@prisma/client";

export type ReceiptLine = {
  id: string;
  productName: string;
  unitPriceTmt: number;
  qty: number;
  lineTotalTmt: number;
};

export type ReceiptTotals = {
  subtotalTmt: number;
  serviceFeeTmt: number;
  deliveryFeeTmt: number;
  totalTmt: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Treat every line on an reopened open order as already printed. */
export function baselinePrintedQty(lines: { id: string; qty: number }[]): Record<string, number> {
  const next: Record<string, number> = {};
  for (const line of lines) {
    next[line.id] = line.qty;
  }
  return next;
}

/** Clamp printed qty when server lines change (qty down, line removed). */
export function syncPrintedQty(
  printedQty: Record<string, number>,
  lines: { id: string; qty: number }[],
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const line of lines) {
    const prev = printedQty[line.id] ?? 0;
    next[line.id] = Math.min(Math.max(0, prev), line.qty);
  }
  return next;
}

export function lineHasPrintedQty(printedQty: Record<string, number>, lineId: string): boolean {
  return (printedQty[lineId] ?? 0) > 0;
}

export function lineNewQty(printedQty: Record<string, number>, line: { id: string; qty: number }): number {
  return Math.max(0, line.qty - (printedQty[line.id] ?? 0));
}

export function hasAnyNewItems(
  printedQty: Record<string, number>,
  lines: { id: string; qty: number }[],
): boolean {
  return lines.some((l) => lineNewQty(printedQty, l) > 0);
}

/** Lines with only the not-yet-printed quantity. */
export function receiptLinesForNewItems<T extends ReceiptLine>(
  printedQty: Record<string, number>,
  lines: T[],
): ReceiptLine[] {
  const out: ReceiptLine[] = [];
  for (const line of lines) {
    const newQty = lineNewQty(printedQty, line);
    if (newQty <= 0) continue;
    out.push({
      id: line.id,
      productName: line.productName,
      unitPriceTmt: line.unitPriceTmt,
      qty: newQty,
      lineTotalTmt: roundMoney(line.unitPriceTmt * newQty),
    });
  }
  return out;
}

export function receiptLinesForFull(lines: ReceiptLine[]): ReceiptLine[] {
  return lines.map((l) => ({ ...l }));
}

export function calcReceiptTotals(
  orderType: OrderType,
  lines: ReceiptLine[],
  options: {
    serviceFeePercent: number;
    fullDeliveryFeeTmt: number;
    includeDelivery: boolean;
  },
): ReceiptTotals {
  const subtotalTmt = roundMoney(lines.reduce((s, l) => s + l.lineTotalTmt, 0));
  let serviceFeeTmt = 0;
  let deliveryFeeTmt = 0;

  if (orderType === OrderType.TABLE && subtotalTmt > 0) {
    const pct = Number.isFinite(options.serviceFeePercent) ? options.serviceFeePercent : 10;
    serviceFeeTmt = roundMoney((subtotalTmt * pct) / 100);
  }

  if (orderType === OrderType.TAKEAWAY_DELIVERY && options.includeDelivery) {
    deliveryFeeTmt = roundMoney(options.fullDeliveryFeeTmt);
  }

  const totalTmt = roundMoney(subtotalTmt + serviceFeeTmt + deliveryFeeTmt);
  return { subtotalTmt, serviceFeeTmt, deliveryFeeTmt, totalTmt };
}

/** After a successful print, advance the printed-qty checkpoint. */
export function commitPrintedAfterPrint(
  printedQty: Record<string, number>,
  lines: { id: string; qty: number }[],
  mode: "full" | "new",
): Record<string, number> {
  const next = { ...printedQty };
  if (mode === "full") {
    for (const line of lines) {
      next[line.id] = line.qty;
    }
    return next;
  }
  for (const line of lines) {
    const newQty = lineNewQty(printedQty, line);
    if (newQty > 0) {
      next[line.id] = line.qty;
    }
  }
  return next;
}
