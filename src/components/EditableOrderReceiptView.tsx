"use client";

import { OrderType } from "@prisma/client";
import { formatTmt } from "@/lib/format-money";
import type { ReceiptLine, ReceiptTotals } from "@/lib/pos/receipt-print";
import { DeliveryFeeRow } from "@/components/pos/DeliveryFeeRow";
import { ServiceFeeRow } from "@/components/pos/ServiceFeeRow";
import { ReceiptStrikeToggle } from "@/components/pos/receipt-strike-toggle";

type EditableOrderReceiptViewProps = {
  venueName: string;
  orderId: string;
  orderType: OrderType;
  tableLabel: string | null;
  timestamp: string;
  allLines: ReceiptLine[];
  omittedLineIds: string[];
  totals: ReceiptTotals;
  orderTypeLabel: (type: OrderType) => string;
  servicePct: string;
  onToggleLine: (lineId: string) => void;
  onToggleServiceFee?: () => void;
  onDecreaseDeliveryFee?: () => void;
  onIncreaseDeliveryFee?: () => void;
  t: (key: string, params?: Record<string, string>) => string;
};

export function EditableOrderReceiptView({
  venueName,
  orderId,
  orderType,
  tableLabel,
  timestamp,
  allLines,
  omittedLineIds,
  totals,
  orderTypeLabel,
  servicePct,
  onToggleLine,
  onToggleServiceFee,
  onDecreaseDeliveryFee,
  onIncreaseDeliveryFee,
  t,
}: EditableOrderReceiptViewProps) {
  const omittedSet = new Set(omittedLineIds);
  const allOmitted = allLines.length > 0 && allLines.every((l) => omittedSet.has(l.id));

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
      <div className="mt-4 space-y-0 text-left text-sm">
        {allOmitted ? (
          <p className="mb-2 text-center text-sm text-stone-500">{t("pos.order.receiptAllRemoved")}</p>
        ) : null}
        {allLines.map((l) => {
          const omitted = omittedSet.has(l.id);
          return (
            <div
              key={l.id}
              className={`flex items-center gap-2 border-b border-stone-200 py-2 ${omitted ? "opacity-70" : ""}`}
            >
              <ReceiptStrikeToggle
                waived={omitted}
                removeLabel={t("pos.order.receiptRemoveLine")}
                restoreLabel={t("pos.order.receiptRestoreLine")}
                onToggle={() => onToggleLine(l.id)}
              />
              <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                <span className={omitted ? "text-stone-500 line-through decoration-stone-400" : ""}>
                  {l.productName} ×{l.qty}
                </span>
                <span
                  className={`shrink-0 tabular-nums ${omitted ? "text-stone-400 line-through decoration-stone-400" : ""}`}
                >
                  {formatTmt(l.lineTotalTmt)}
                </span>
              </div>
            </div>
          );
        })}
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
            editable={!!onToggleServiceFee}
            onToggle={onToggleServiceFee}
            t={t}
          />
        ) : null}
        {orderType === OrderType.TAKEAWAY_DELIVERY ? (
          <DeliveryFeeRow
            deliveryFeeTmt={totals.deliveryFeeTmt}
            editable={!!onDecreaseDeliveryFee && !!onIncreaseDeliveryFee}
            onDecrease={onDecreaseDeliveryFee}
            onIncrease={onIncreaseDeliveryFee}
            t={t}
          />
        ) : null}
        <div className="flex justify-between border-t border-stone-900 pt-2 text-base font-bold text-stone-900">
          <dt>{t("pos.order.total")}</dt>
          <dd>{formatTmt(totals.totalTmt)}</dd>
        </div>
      </dl>
    </div>
  );
}
