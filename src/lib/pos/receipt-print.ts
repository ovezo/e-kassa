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
