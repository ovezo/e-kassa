"use client";

import { PageHeader } from "@/components/PageHeader";
import { DaySummaryReceiptView, type DaySummaryData } from "@/components/DaySummaryPrintView";
import { OrderReceiptView } from "@/components/OrderReceiptView";
import { ReceiptModal } from "@/components/ReceiptModal";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OrderStatus, OrderType } from "@prisma/client";
import { ikassirInvoke } from "@/lib/electron-api";
import { formatTmt } from "@/lib/format-money";
import { receiptLinesForFull } from "@/lib/pos/receipt-print";
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

/** Matches `orders.get` include payload for receipt modal. */
type OrderDetailForReceipt = {
  id: string;
  type: OrderType;
  status: OrderStatus;
  openedAt: string;
  closedAt: string | null;
  table: { id: string; label: string } | null;
  lines: Array<{
    id: string;
    productName: string;
    unitPriceTmt: number;
    qty: number;
    lineTotalTmt: number;
  }>;
  subtotalTmt: number;
  serviceFeeTmt: number;
  deliveryFeeTmt: number;
  totalTmt: number;
};

function HistoryOrderCardSummary({
  o,
  typeLabel,
  t,
}: {
  o: DayRow;
  typeLabel: (ot: OrderType) => string;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  return (
    <>
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
    </>
  );
}

export default function PosHistoryPage() {
  const t = useTranslations();
  const { locale } = useLocale();
  const session = readSession();
  const [orders, setOrders] = useState<DayRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [daySummary, setDaySummary] = useState<DaySummaryData | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [receiptBusyId, setReceiptBusyId] = useState<string | null>(null);
  const [orderReceipt, setOrderReceipt] = useState<{
    order: OrderDetailForReceipt;
    venueName: string;
    servicePct: string;
    deliveryFee: string;
  } | null>(null);

  const orderTypeLabel = useCallback(
    (type: OrderType) => {
      switch (type) {
        case OrderType.TABLE:
          return t("pos.order.type.table");
        case OrderType.TAKEAWAY_PICKUP:
          return t("pos.order.type.pickup");
        case OrderType.TAKEAWAY_DELIVERY:
          return t("pos.order.type.delivery");
        default:
          return type;
      }
    },
    [t],
  );

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

  async function openClosedOrderReceipt(o: DayRow) {
    if (o.status !== OrderStatus.CLOSED) return;
    setReceiptBusyId(o.id);
    setError(null);
    try {
      const [orderRes, settings] = await Promise.all([
        ikassirInvoke<
          { ok: true; order: OrderDetailForReceipt } | { ok: false; error?: string }
        >("orders.get", { id: o.id }),
        ikassirInvoke<Record<string, string>>("settings.getAll"),
      ]);
      if (!orderRes.ok) {
        setError(orderRes.error ?? "Order not found");
        return;
      }
      setOrderReceipt({
        order: orderRes.order,
        venueName: settings.venue_name ?? "Coffee Shop",
        servicePct: settings.service_fee_percent ?? "10",
        deliveryFee: settings.delivery_fee_tmt ?? "3",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load receipt");
    } finally {
      setReceiptBusyId(null);
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
        backHref="/pos/open"
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
            {o.status === OrderStatus.OPEN ? (
              <Link
                href={`/pos/order?id=${o.id}`}
                className="block touch-manipulation active:scale-[0.99]"
              >
                <HistoryOrderCardSummary o={o} typeLabel={orderTypeLabel} t={t} />
              </Link>
            ) : (
              <button
                type="button"
                className="block w-full touch-manipulation text-left active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
                disabled={receiptBusyId === o.id}
                onClick={() => void openClosedOrderReceipt(o)}
              >
                <HistoryOrderCardSummary o={o} typeLabel={orderTypeLabel} t={t} />
              </button>
            )}
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

      {orderReceipt ? (
        <ReceiptModal
          open
          onClose={() => setOrderReceipt(null)}
          title={t("pos.order.printReceiptFull")}
        >
          <OrderReceiptView
            venueName={orderReceipt.venueName}
            orderId={orderReceipt.order.id}
            orderType={orderReceipt.order.type}
            tableLabel={orderReceipt.order.table?.label ?? null}
            timestamp={orderReceipt.order.closedAt ?? orderReceipt.order.openedAt}
            lines={receiptLinesForFull(orderReceipt.order.lines)}
            totals={{
              subtotalTmt: orderReceipt.order.subtotalTmt,
              serviceFeeTmt: orderReceipt.order.serviceFeeTmt,
              deliveryFeeTmt: orderReceipt.order.deliveryFeeTmt,
              totalTmt: orderReceipt.order.totalTmt,
            }}
            orderTypeLabel={orderTypeLabel}
            servicePct={orderReceipt.servicePct}
            deliveryFee={orderReceipt.deliveryFee}
            t={t}
          />
        </ReceiptModal>
      ) : null}
    </div>
  );
}
