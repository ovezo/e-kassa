"use client";

import { formatTmt } from "@/lib/format-money";
import { ReceiptStrikeToggle } from "./receipt-strike-toggle";

type ServiceFeeRowProps = {
  servicePct: string;
  serviceFeeTmt: number;
  waived: boolean;
  editable?: boolean;
  toggleDisabled?: boolean;
  onToggle?: () => void;
  t: (key: string, params?: Record<string, string>) => string;
};

export function ServiceFeeRow({
  servicePct,
  serviceFeeTmt,
  waived,
  editable = false,
  toggleDisabled = false,
  onToggle,
  t,
}: ServiceFeeRowProps) {
  if (serviceFeeTmt <= 0 && !waived) return null;

  const strike = waived ? "text-stone-500 line-through decoration-stone-400" : "";

  return (
    <div className="flex items-center gap-2 text-stone-600">
      {editable && onToggle ? (
        <ReceiptStrikeToggle
          waived={waived}
          disabled={toggleDisabled}
          removeLabel={t("pos.order.serviceRemove")}
          restoreLabel={t("pos.order.serviceRestore")}
          onToggle={onToggle}
        />
      ) : null}
      <div className={`flex min-w-0 flex-1 justify-between gap-2 ${editable ? "" : "w-full"}`}>
        <dt className={strike}>{t("pos.order.service", { pct: servicePct })}</dt>
        <dd className={`font-medium tabular-nums ${strike || "text-stone-900"}`}>
          {formatTmt(serviceFeeTmt)}
        </dd>
      </div>
    </div>
  );
}