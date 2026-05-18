"use client";

import { PageHeader } from "@/components/PageHeader";
import { DaySummaryReceiptView, type DaySummaryData } from "@/components/DaySummaryPrintView";
import { OrderReceiptDialog } from "@/components/pos/OrderReceiptDialog";
import { PosOrderListCard } from "@/components/pos/PosOrderListCard";
import { PosOrderListGrid, PosOrderListGridItem } from "@/components/pos/PosOrderListGrid";
import { usePosOrderListActions } from "@/components/pos/usePosOrderListActions";
import { ReceiptModal } from "@/components/ReceiptModal";
import { useCallback, useEffect, useState } from "react";
import { OrderStatus, OrderType } from "@prisma/client";
import { unikassaInvoke } from "@/lib/electron-api";
import type { PosOrderListRow } from "@/lib/pos/order-list-row";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";
import { printReceiptSilent, printReceiptSystemDialog } from "@/lib/pos/print-receipt";
import type { ReceiptPrintPayload } from "@/lib/pos/receipt-html";
import { readSession } from "@/lib/session";

const btnAction =
  "min-h-[44px] touch-manipulation rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-base font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50";
const input =
  "min-h-[44px] touch-manipulation rounded-xl border border-stone-300 px-4 py-2 text-base outline-none focus:ring-2 focus:ring-stone-400";

export default function AdminOrderHistoryPage() {
  const t = useTranslations();
  const { locale } = useLocale();
  const [orders, setOrders] = useState<PosOrderListRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [daySummary, setDaySummary] = useState<DaySummaryData | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(false);

  // Helper to format date for datetime-local input (local time, not UTC)
  function formatDateTimeLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    const hour = now.getHours();
    if (hour < 6) {
      now.setDate(now.getDate() - 1);
    }
    now.setHours(6, 0, 0, 0);
    return formatDateTimeLocal(now);
  });

  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    const hour = now.getHours();
    if (hour >= 6) {
      now.setDate(now.getDate() + 1);
    }
    now.setHours(6, 0, 0, 0);
    return formatDateTimeLocal(now);
  });

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        setError("Invalid date format");
        return;
      }

      if (start >= end) {
        setError("Start date must be before end date");
        return;
      }

      const result = await unikassaInvoke<{ ok: boolean; orders?: PosOrderListRow[]; error?: string }>(
        "orders.listByDateRange",
        {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        },
      );

      if (!result.ok || !result.orders) {
        setError(result.error ?? "Failed to load orders");
        return;
      }

      setOrders(result.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const {
    receiptOrderId,
    openReceipt,
    closeReceipt,
    onReceiptOrderUpdated,
    payClose,
    payCloseBusyId,
    deleteOrder,
    deletingId,
    isAdmin,
  } = usePosOrderListActions(load);

  useEffect(() => {
    void load();
  }, []);

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

  function statusLabel(order: PosOrderListRow): string {
    return order.status === OrderStatus.OPEN
      ? t("pos.history.badgeOpen")
      : t("pos.history.badgeClosed");
  }

  async function openDaySummary() {
    setSummaryBusy(true);
    setError(null);
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        setError("Invalid date format");
        return;
      }

      const [result, cfg] = await Promise.all([
        unikassaInvoke<{ ok: boolean; summary?: DaySummaryData; error?: string }>(
          "orders.daySummaryByDateRange",
          {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
          },
        ),
        unikassaInvoke<Record<string, string>>("settings.getAll"),
      ]);

      if (!result.ok || !result.summary) {
        setError(result.error ?? "Failed to load summary");
        return;
      }

      setDaySummary(result.summary);
      setSettings(cfg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load summary");
    } finally {
      setSummaryBusy(false);
    }
  }

  function buildDaySummaryPrintPayload(): ReceiptPrintPayload | null {
    if (!daySummary || !settings) return null;
    const session = readSession();
    if (!session) return null;

    const lines = daySummary.products.map((p, idx) => ({
      id: `product-${idx}`,
      productName: p.productName,
      qty: p.qty,
      unitPriceTmt: p.totalTmt / p.qty,
      lineTotalTmt: p.totalTmt,
    }));

    let subtotal = daySummary.products.reduce((sum, p) => sum + p.totalTmt, 0);
    const serviceTotal = daySummary.service?.totalTmt ?? 0;
    const deliveryTotal = daySummary.delivery?.totalTmt ?? 0;

    return {
      venueName: settings.venue_name ?? "Coffee Shop",
      venueAddress: settings.venue_address ?? "",
      cashierName: session.displayName,
      customerLabel: `${t("admin.orderHistory.summaryTitle")} (${daySummary.orderCount} orders)`,
      note: "",
      timestamp: daySummary.businessDayStart,
      orderType: OrderType.TABLE,
      lines,
      totals: {
        subtotalTmt: subtotal,
        serviceFeeTmt: serviceTotal,
        deliveryFeeTmt: deliveryTotal,
        totalTmt: daySummary.dayTotalTmt,
        serviceFeeWaived: false,
      },
      labels: {
        kassir: t("pos.receipt.print.kassir"),
        musderi: t("pos.receipt.print.musderi"),
        bellik: t("pos.receipt.print.bellik"),
        wagt: t("pos.receipt.print.wagt"),
        sene: t("pos.receipt.print.sene"),
        colProduct: t("pos.receipt.print.colProduct"),
        colQty: t("pos.receipt.print.colQty"),
        colPrice: t("pos.receipt.print.colPrice"),
        colTotal: t("pos.receipt.print.colTotal"),
        grandTotal: t("pos.receipt.print.grandTotal"),
        eltipBerme: t("pos.receipt.print.eltipBerme"),
        hyzmat: t("pos.receipt.print.hyzmat"),
        footer: settings.receipt_footer ?? t("pos.receipt.print.footer"),
      },
      servicePct: settings.service_fee_percent ?? "10",
    };
  }

  async function handlePrintDaySummary() {
    const payload = buildDaySummaryPrintPayload();
    if (!payload) return;

    setPrintBusy(true);
    setError(null);
    try {
      const res = await printReceiptSilent(payload);
      if (!res.ok) {
        setError(
          `${res.error ?? t("pos.order.receiptPrintFailed")} ${t("pos.order.receiptPrintTrySystem")}`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pos.order.receiptPrintFailed"));
    } finally {
      setPrintBusy(false);
    }
  }

  function handleSystemPrintDaySummary() {
    const payload = buildDaySummaryPrintPayload();
    if (!payload) return;

    setError(null);
    const res = printReceiptSystemDialog(payload);
    if (!res.ok) setError(res.error ?? t("pos.order.receiptPrintFailed"));
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.orderHistory.title")} backHref="/admin/dashboard" />

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-stone-800">{t("admin.orderHistory.filterTitle")}</h2>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium text-stone-600">
              {t("admin.orderHistory.startDate")}
            </label>
            <input
              type="datetime-local"
              className={input + " mt-1 w-full cursor-pointer"}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch (err) {
                  // Ignore showPicker errors
                }
              }}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium text-stone-600">
              {t("admin.orderHistory.endDate")}
            </label>
            <input
              type="datetime-local"
              className={input + " mt-1 w-full cursor-pointer"}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch (err) {
                  // Ignore showPicker errors
                }
              }}
            />
          </div>
          <button
            type="button"
            className={btnAction}
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? t("common.loading") : t("admin.orderHistory.search")}
          </button>
          <button
            type="button"
            className={btnAction}
            disabled={summaryBusy || orders.length === 0}
            onClick={() => void openDaySummary()}
          >
            {t("admin.orderHistory.viewSummary")}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">{error}</p>
      ) : null}

      <PosOrderListGrid>
        {orders.map((o) => (
          <PosOrderListGridItem key={o.id}>
            <PosOrderListCard
              order={o}
              locale={locale}
              typeLabel={orderTypeLabel}
              statusLabel={statusLabel(o)}
              t={t}
              onReceipt={() => openReceipt(o.id)}
              onPayClose={o.status === OrderStatus.OPEN ? () => void payClose(o) : undefined}
              onDelete={isAdmin ? () => void deleteOrder(o) : undefined}
              receiptBusy={receiptOrderId === o.id}
              payCloseBusy={payCloseBusyId === o.id}
              deleteBusy={deletingId === o.id}
            />
          </PosOrderListGridItem>
        ))}
      </PosOrderListGrid>

      {orders.length === 0 && !error && !loading ? (
        <p className="text-lg text-stone-500">{t("admin.orderHistory.empty")}</p>
      ) : null}

      <OrderReceiptDialog
        orderId={receiptOrderId}
        onClose={closeReceipt}
        onOrderUpdated={onReceiptOrderUpdated}
      />

      {daySummary ? (
        <ReceiptModal
          open
          onClose={() => setDaySummary(null)}
          title={t("admin.orderHistory.summaryTitle")}
          onPrint={() => void handlePrintDaySummary()}
          onSystemPrint={handleSystemPrintDaySummary}
          printBusy={printBusy}
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
