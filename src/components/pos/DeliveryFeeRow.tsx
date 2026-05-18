"use client";

import { formatTmt } from "@/lib/format-money";

const stepBtn =
  "flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-stone-300 bg-white text-lg font-bold leading-none text-stone-800 hover:bg-stone-50 active:scale-[0.98] disabled:opacity-40";

type DeliveryFeeRowProps = {
  deliveryFeeTmt: number;
  editable?: boolean;
  disabled?: boolean;
  onDecrease?: () => void;
  onIncrease?: () => void;
  t: (key: string, params?: Record<string, string>) => string;
};

export function DeliveryFeeRow({
  deliveryFeeTmt,
  editable = false,
  disabled = false,
  onDecrease,
  onIncrease,
  t,
}: DeliveryFeeRowProps) {
  if (!editable && deliveryFeeTmt <= 0) return null;

  return (
    <div className="text-stone-600">
      <div className="flex justify-between gap-2">
        <dt>{t("pos.order.deliveryFee")}</dt>
        <dd className="font-medium tabular-nums text-stone-900">{formatTmt(deliveryFeeTmt)}</dd>
      </div>
      {editable && onDecrease && onIncrease ? (
        <div className="mt-1.5 flex justify-end gap-1">
          <button
            type="button"
            className={stepBtn}
            disabled={disabled || deliveryFeeTmt <= 0}
            aria-label={t("pos.order.deliveryDecrease")}
            onClick={onDecrease}
          >
            −
          </button>
          <button
            type="button"
            className={stepBtn}
            disabled={disabled}
            aria-label={t("pos.order.deliveryIncrease")}
            onClick={onIncrease}
          >
            +
          </button>
        </div>
      ) : null}
    </div>
  );
}
