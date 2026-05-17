"use client";

import { formatTmt } from "@/lib/format-money";
import { formatBusinessDayRange } from "@/lib/business-day";

export type DaySummaryData = {
  businessDayStart: string;
  businessDayEnd: string;
  businessTimeZone?: string;
  venueName: string;
  orderCount: number;
  products: { productName: string; qty: number; totalTmt: number }[];
  service: { count: number; totalTmt: number } | null;
  delivery: { count: number; totalTmt: number } | null;
  dayTotalTmt: number;
};

type DaySummaryReceiptViewProps = {
  summary: DaySummaryData;
  t: (key: string, params?: Record<string, string>) => string;
  locale?: string;
};

export function DaySummaryReceiptView({ summary, t, locale }: DaySummaryReceiptViewProps) {
  const start = new Date(summary.businessDayStart);
  const end = new Date(summary.businessDayEnd);
  const rangeLabel = formatBusinessDayRange(
    start,
    end,
    locale,
    summary.businessTimeZone,
  );

  return (
    <div className="mx-auto max-w-md text-center text-sm">
      <div className="text-xl font-bold">{summary.venueName}</div>
      <div className="mt-1 text-base font-semibold text-stone-800">{t("pos.history.daySummaryTitle")}</div>
      <div className="mt-2 text-stone-600">{rangeLabel}</div>
      <div className="mt-1 text-xs text-stone-500">
        {t("pos.history.ordersCount", { count: String(summary.orderCount) })}
      </div>

      <div className="mt-4 text-left text-sm">
        {summary.products.length === 0 ? (
          <p className="text-stone-500">{t("pos.history.daySummaryNoProducts")}</p>
        ) : (
          summary.products.map((p) => (
            <div
              key={p.productName}
              className="flex justify-between gap-2 border-b border-stone-200 py-1"
            >
              <span>
                {p.productName} ×{p.qty}
              </span>
              <span className="shrink-0">{formatTmt(p.totalTmt)}</span>
            </div>
          ))
        )}
      </div>

      <dl className="mt-4 space-y-1 border-t border-stone-300 pt-2 text-left text-sm">
        {summary.service ? (
          <div className="flex justify-between text-stone-600">
            <dt>{t("pos.history.serviceLine", { count: String(summary.service.count) })}</dt>
            <dd className="font-medium text-stone-900">{formatTmt(summary.service.totalTmt)}</dd>
          </div>
        ) : null}
        {summary.delivery ? (
          <div className="flex justify-between text-stone-600">
            <dt>{t("pos.history.deliveryLine", { count: String(summary.delivery.count) })}</dt>
            <dd className="font-medium text-stone-900">{formatTmt(summary.delivery.totalTmt)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-stone-900 pt-2 text-base font-bold text-stone-900">
          <dt>{t("pos.history.dayTotal")}</dt>
          <dd>{formatTmt(summary.dayTotalTmt)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** @deprecated Use DaySummaryReceiptView */
export const DaySummaryPrintView = DaySummaryReceiptView;
