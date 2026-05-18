"use client";

import { formatTmt } from "@/lib/format-money";
import type { ProductChartRow } from "@/lib/product-sales";
import { relativeBarColor } from "@/lib/product-sales";

const CURRENT_HUE = 32;
const PREVIOUS_HUE = 210;

type Props = {
  rows: ProductChartRow[];
  currentLabel: string;
  previousLabel: string;
};

function qtyWithRevenue(qty: number, revenueTmt: number): string {
  if (qty <= 0) return `0 (${formatTmt(0)})`;
  return `${qty} (${formatTmt(revenueTmt)})`;
}

export function TopProductsChart({ rows, currentLabel, previousLabel }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-stone-500">—</p>;
  }

  const maxQty = Math.max(
    1,
    ...rows.flatMap((r) => [r.currentQty, r.previousQty]),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-xs text-stone-600">
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-5 rounded-sm border border-amber-300"
            style={{ backgroundColor: relativeBarColor(maxQty, maxQty, CURRENT_HUE) }}
          />
          {currentLabel}
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-5 rounded-sm border border-sky-300"
            style={{ backgroundColor: relativeBarColor(maxQty, maxQty, PREVIOUS_HUE) }}
          />
          {previousLabel}
        </span>
      </div>

      <ol className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map((row, index) => (
          <li key={row.productName} className="min-w-0">
            <p className="mb-0.5 truncate text-xs font-medium text-stone-800">
              <span className="mr-1.5 tabular-nums text-stone-400">{index + 1}.</span>
              {row.productName}
            </p>
            <div className="space-y-0.5">
              <BarRow
                qty={row.currentQty}
                revenueTmt={row.currentRevenueTmt}
                maxQty={maxQty}
                hue={CURRENT_HUE}
                borderClass="border-amber-200/80"
              />
              <BarRow
                qty={row.previousQty}
                revenueTmt={row.previousRevenueTmt}
                maxQty={maxQty}
                hue={PREVIOUS_HUE}
                borderClass="border-sky-200/80"
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BarRow({
  qty,
  revenueTmt,
  maxQty,
  hue,
  borderClass,
}: {
  qty: number;
  revenueTmt: number;
  maxQty: number;
  hue: number;
  borderClass: string;
}) {
  const widthPct = maxQty > 0 ? (qty / maxQty) * 100 : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-sm border bg-stone-100/80">
        <div
          className={`absolute inset-y-0 left-0 rounded-sm border ${borderClass}`}
          style={{
            width: `${widthPct}%`,
            backgroundColor: relativeBarColor(qty, maxQty, hue),
          }}
        />
      </div>
      <span className="max-w-[44%] shrink-0 text-right text-[10px] leading-tight font-medium tabular-nums text-stone-600">
        {qtyWithRevenue(qty, revenueTmt)}
      </span>
    </div>
  );
}
