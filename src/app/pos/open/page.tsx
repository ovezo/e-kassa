"use client";

import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useState } from "react";
import { OrderStatus, OrderType } from "@prisma/client";
import { ikassirInvoke } from "@/lib/electron-api";
import { formatTmt } from "@/lib/format-money";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

const cardClass =
  "block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-amber-300 active:scale-[0.99]";

type OpenRow = {
  id: string;
  type: OrderType;
  status: OrderStatus;
  openedAt: string;
  totalTmt: number;
  table: { id: string; label: string } | null;
  openedBy: { id: string; displayName: string };
  _count: { lines: number };
};

export default function PosOpenOrdersPage() {
  const t = useTranslations();
  const [orders, setOrders] = useState<OpenRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  function typeLabel(ot: OrderType): string {
    switch (ot) {
      case OrderType.TABLE:
        return t("pos.order.type.table");
      case OrderType.TAKEAWAY_PICKUP:
        return t("pos.order.type.pickup");
      case OrderType.TAKEAWAY_DELIVERY:
        return t("pos.order.type.delivery");
      default:
        return ot;
    }
  }

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await ikassirInvoke<OpenRow[]>("orders.listOpen");
      setOrders(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pos.open.title")}
        subtitle={t("pos.open.subtitle")}
        backHref="/pos"
        actions={
          <button
            type="button"
            className="min-h-[44px] touch-manipulation rounded-xl border border-stone-300 bg-white px-4 py-2 text-base font-medium hover:bg-stone-50"
            onClick={() => void load()}
          >
            {t("common.refresh")}
          </button>
        }
      />
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">{error}</p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {orders.map((o) => (
          <li key={o.id}>
            <Link href={`/pos/order?id=${o.id}`} className={cardClass}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-lg font-semibold text-stone-900">
                  {typeLabel(o.type)}
                  {o.table ? ` · ${o.table.label}` : ""}
                </span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950">
                  {t("pos.open.badge")}
                </span>
              </div>
              <p className="mt-2 text-sm text-stone-500">{o.openedBy.displayName}</p>
              <p className="mt-1 text-sm text-stone-500">
                {new Date(o.openedAt).toLocaleString()} · {t("pos.open.linesMeta", { count: String(o._count.lines) })}
              </p>
              <p className="mt-3 text-xl font-bold text-stone-900">{formatTmt(o.totalTmt)}</p>
            </Link>
          </li>
        ))}
      </ul>
      {orders.length === 0 && !error ? (
        <p className="text-lg text-stone-500">{t("pos.open.empty")}</p>
      ) : null}
    </div>
  );
}
