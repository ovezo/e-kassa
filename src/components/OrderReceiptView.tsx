"use client";

import { OrderType } from "@prisma/client";
import { formatTmt } from "@/lib/format-money";
import type { ReceiptLine, ReceiptTotals } from "@/lib/pos/receipt-print";
import { DeliveryFeeRow } from "@/components/pos/DeliveryFeeRow";
import { ServiceFeeRow } from "@/components/pos/ServiceFeeRow";

type OrderReceiptViewProps = {
  venueName: string;
  orderId: string;
  orderType: OrderType;
  tableLabel: string | null;
  timestamp: string;
  lines: ReceiptLine[];
  totals: ReceiptTotals;
  orderTypeLabel: (type: OrderType) => string;
  servicePct: string;
  t: (key: string, params?: Record<string, string>) => string;
};

export function OrderReceiptView({
  venueName,
  orderId,
  orderType,
  tableLabel,
  timestamp,
  lines,
  totals,
  orderTypeLabel,
  servicePct,
  t,
}: OrderReceiptViewProps) {
  return (
    <div className="mx-auto max-w-md text-center text-sm">
      <div className="text-xl font-bold">{venueName}</div>
      <div className="mt-2 text-stone-600">{new Date(timestamp).toLocaleString()}</div>
      <div className="mt-1 font-mono text-xs">
        {t("pos.order.printOrderId")} {orderId.slice(0, 8)}…
      </div>
      <div className="mt-1">
        {orderTypeLabel(orderType)}
        {tableLabel ? ` · ${tableLabel}` : ""}
      </div>
      <div className="mt-4 text-left text-sm">
        {lines.map((l) => (
          <div key={l.id} className="flex justify-between border-b border-stone-200 py-1">
            <span>
              {l.productName} ×{l.qty}
            </span>
            <span>{formatTmt(l.lineTotalTmt)}</span>
          </div>
        ))}
      </div>
      <dl className="mt-4 space-y-1 border-t border-stone-300 pt-2 text-left text-sm">
        {orderType !== OrderType.TAKEAWAY_PICKUP ? (
          <div className="flex justify-between text-stone-600">
            <dt>{t("pos.order.subtotal")}</dt>
            <dd className="font-medium text-stone-900">{formatTmt(totals.subtotalTmt)}</dd>
          </div>
        ) : null}
        {orderType === OrderType.TABLE ? (
          <ServiceFeeRow
            servicePct={servicePct}
            serviceFeeTmt={totals.serviceFeeTmt}
            waived={!!totals.serviceFeeWaived}
            t={t}
          />
        ) : null}
        {orderType === OrderType.TAKEAWAY_DELIVERY ? (
          <DeliveryFeeRow deliveryFeeTmt={totals.deliveryFeeTmt} t={t} />
        ) : null}
        <div className="flex justify-between border-t border-stone-900 pt-2 text-base font-bold text-stone-900">
          <dt>{t("pos.order.total")}</dt>
          <dd>{formatTmt(totals.totalTmt)}</dd>
        </div>
      </dl>
    </div>
  );
}
