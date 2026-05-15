"use client";

import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DaySummaryReceiptView, type DaySummaryData } from "@/components/DaySummaryPrintView";
import { ReceiptModal } from "@/components/ReceiptModal";
import { useCallback, useEffect, useState } from "react";
import { OrderStatus, OrderType } from "@prisma/client";
import { ikassirInvoke } from "@/lib/electron-api";
import { formatTmt } from "@/lib/format-money";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";
import { readSession } from "@/lib/session";

const cardClass =
  "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-amber-300";
const btnAction =
  "min-h-[44px] touch-manipulation rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-base font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50";
const btnDanger =
  "min-h-[44px] shrink-0 touch-manipulation rounded-xl border border-red-200 bg-white px-4 py-2 text-base font-medium text-red-800 hover:bg-red-50 disabled:opacity-50";

type DayRow = {
  id: string;
  type: OrderType;
  status: OrderStatus;
  openedAt: string;
  closedAt: string | null;
  totalTmt: number;
  table: { id: string; label: string } | null;
  openedBy: { id: string; displayName: string };
  _count: { lines: number };
};

export default function PosHistoryPage() {
  const t = useTranslations();
  const { locale } = useLocale();
  const session = readSession();
  const [orders, setOrders] = useState<DayRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [daySummary, setDaySummary] = useState<DaySummaryData | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      const list = await ikassirInvoke<DayRow[]>("orders.listToday");
      setOrders(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDaySummary() {
    setSummaryBusy(true);
    setError(null);
    try {
      const summary = await ikassirInvoke<DaySummaryData>("orders.daySummary");
      setDaySummary(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load summary");
    } finally {
      setSummaryBusy(false);
    }
  }

  async function deleteOrder(o: DayRow) {
    if (!session) return;
    const total = formatTmt(o.totalTmt);
    const message =
      o.status === OrderStatus.OPEN
        ? t("pos.history.deleteConfirmOpen", { total })
        : t("pos.history.deleteConfirm", { total });
    if (!confirm(message)) return;

    setDeletingId(o.id);
    setError(null);
    try {
      const res = await ikassirInvoke<{ ok: boolean; error?: string }>("orders.delete", {
        orderId: o.id,
        actorUserId: session.id,
      });
      if (!res.ok) {
        setError(res.error ?? t("pos.history.deleteFailed"));
        return;
      }
      setOrders((prev) => prev.filter((row) => row.id !== o.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pos.history.deleteFailed"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pos.history.title")}
        subtitle={t("pos.history.subtitle")}
        backHref="/pos"
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnAction}
              disabled={summaryBusy}
              onClick={() => void openDaySummary()}
            >
              {t("pos.history.printDaySummary")}
            </button>
            <button
              type="button"
              className="min-h-[44px] touch-manipulation rounded-xl border border-stone-300 bg-white px-4 py-2 text-base font-medium hover:bg-stone-50"
              onClick={() => void load()}
            >
              {t("common.refresh")}
            </button>
          </div>
        }
      />
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">{error}</p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {orders.map((o) => (
          <li key={o.id} className={cardClass}>
            <Link
              href={`/pos/order?id=${o.id}`}
              className="block touch-manipulation active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-lg font-semibold text-stone-900">
                  {typeLabel(o.type)}
                  {o.table ? ` · ${o.table.label}` : ""}
                </span>
                <span
                  className={
                    o.status === OrderStatus.OPEN
                      ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950"
                      : "rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-800"
                  }
                >
                  {o.status === OrderStatus.OPEN ? t("pos.history.badgeOpen") : t("pos.history.badgeClosed")}
                </span>
              </div>
              <p className="mt-2 text-sm text-stone-500">{o.openedBy.displayName}</p>
              <p className="mt-1 text-sm text-stone-500">
                {new Date(o.openedAt).toLocaleString()} · {t("pos.history.linesMeta", { count: String(o._count.lines) })}
              </p>
              <p className="mt-3 text-xl font-bold text-stone-900">{formatTmt(o.totalTmt)}</p>
            </Link>
            <div className="mt-4 border-t border-stone-100 pt-3">
              <button
                type="button"
                className={btnDanger}
                disabled={deletingId === o.id || !session}
                onClick={() => void deleteOrder(o)}
              >
                {deletingId === o.id ? t("common.loading") : t("pos.history.deleteOrder")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {orders.length === 0 && !error ? (
        <p className="text-lg text-stone-500">{t("pos.history.empty")}</p>
      ) : null}

      {daySummary ? (
        <ReceiptModal
          open
          onClose={() => setDaySummary(null)}
          title={t("pos.history.daySummaryTitle")}
        >
          <DaySummaryReceiptView
            summary={daySummary}
            t={t}
            locale={locale === "ru" ? "ru-RU" : "en-US"}
          />
        </ReceiptModal>
      ) : null}
    </div>
  );
}
