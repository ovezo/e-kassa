"use client";

import Link from "next/link";
import { OrderStatus, OrderType } from "@prisma/client";
import { formatOrderListDateTime } from "@/lib/format-datetime";
import { formatTmt } from "@/lib/format-money";
import { formatOrderCardItemsSummary } from "@/lib/pos/order-items-summary";
import type { PosOrderListRow } from "@/lib/pos/order-list-row";
import { OrderTypeIcon, orderTypeIconWrapClass } from "./order-type-icons";
import { posBtnDeleteIcon, posBtnPrimary, posBtnReceipt } from "./pos-order-buttons";

export type PosOrderListCardProps = {
  order: PosOrderListRow;
  locale: string;
  typeLabel: (type: OrderType) => string;
  statusLabel: string;
  t: (key: string, params?: Record<string, string>) => string;
  onReceipt: () => void;
  onPayClose?: () => void;
  onDelete?: () => void;
  receiptBusy?: boolean;
  payCloseBusy?: boolean;
  deleteBusy?: boolean;
};

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

export function PosOrderListCard({
  order,
  locale,
  typeLabel,
  statusLabel,
  t,
  onReceipt,
  onPayClose,
  onDelete,
  receiptBusy = false,
  payCloseBusy = false,
  deleteBusy = false,
}: PosOrderListCardProps) {
  const hasLines = order.lines.length > 0;
  const isOpen = order.status === OrderStatus.OPEN;
  const dateLabel = formatOrderListDateTime(order.openedAt, locale);
  const actionsBusy = receiptBusy || payCloseBusy || deleteBusy;
  const orderAriaLabel = order.table
    ? `${typeLabel(order.type)} · ${order.table.label}`
    : typeLabel(order.type);

  return (
    <article className={`flex h-full min-h-[160px] w-full min-w-0 flex-col rounded-2xl border border-stone-200 shadow-sm ${isOpen ? "bg-white" : "bg-gray-100"}`}>
      <div className="flex min-w-0 flex-1 flex-col p-5 pb-2">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/pos/order?id=${order.id}`}
            aria-label={orderAriaLabel}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-stone-900 hover:text-amber-950"
          >
            <OrderTypeIcon type={order.type} className="h-5 w-5" />
            <span className="min-w-0 truncate text-lg font-semibold leading-snug">
              {order.type === OrderType.TABLE ? order.table?.label : typeLabel(order.type)}
            </span>
          </Link>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <span
              className={
                isOpen
                  ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950"
                  : "rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-800"
              }
            >
              {statusLabel}
            </span>
          </div>
        </div>
        <p className="mt-2 min-w-0 text-sm text-stone-600 line-clamp-2">
          {formatOrderCardItemsSummary(order.lines, t)}
        </p>
        <div className="mt-auto pt-2 flex items-end justify-between">
          <p className="text-xl font-bold text-stone-900">{formatTmt(order.totalTmt)}</p>
          <span className="text-xs tabular-nums text-stone-500 mb-1">{dateLabel}</span>
        </div>
      </div>

      <div className="mt-auto flex w-full min-w-0 items-stretch gap-2 border-t border-stone-100 p-4">
        <button
          type="button"
          className={`${posBtnReceipt} min-w-0`}
          disabled={!hasLines || actionsBusy}
          onClick={onReceipt}
        >
          <span className="truncate">
            {receiptBusy ? t("common.loading") : t("pos.order.printReceiptFull")}
          </span>
        </button>
        {onPayClose ? (
          <button
            type="button"
            className={`${posBtnPrimary} min-w-0`}
            disabled={!hasLines || actionsBusy}
            onClick={onPayClose}
          >
            <span className="truncate">
              {payCloseBusy ? t("common.loading") : t("pos.order.payClose")}
            </span>
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            className={posBtnDeleteIcon}
            disabled={actionsBusy}
            aria-label={t("pos.history.deleteOrder")}
            onClick={onDelete}
          >
            <TrashIcon className={`h-5 w-5 ${deleteBusy ? "opacity-40" : ""}`} />
          </button>
        ) : null}
      </div>
    </article>
  );
}
