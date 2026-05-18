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
import { waitForPendingOrderDiscard } from "@/lib/pos/discard-empty-order";
import type { PosOrderListRow } from "@/lib/pos/order-list-row";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";
import { attachReceiptLogo } from "@/lib/pos/receipt-print-logo";
import { printReceiptSilent, printReceiptSystemDialog } from "@/lib/pos/print-receipt";
import type { ReceiptPrintPayload } from "@/lib/pos/receipt-html";
import { readSession } from "@/lib/session";

const btnAction =
  "min-h-[44px] touch-manipulation rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-base font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50";

export default function PosHistoryPage() {
  const t = useTranslations();
  const { locale } = useLocale();
  const [orders, setOrders] = useState<PosOrderListRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [daySummary, setDaySummary] = useState<DaySummaryData | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [settings, setSettings] = useState<Record<string, string> | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      await waitForPendingOrderDiscard();
      const list = await unikassaInvoke<PosOrderListRow[]>("orders.listToday");
      setOrders(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

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
  }, [load]);

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
      const [summary, cfg] = await Promise.all([
        unikassaInvoke<DaySummaryData>("orders.daySummary"),
        unikassaInvoke<Record<string, string>>("settings.getAll"),
      ]);
      setDaySummary(summary);
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
      customerLabel: `${t("pos.history.daySummaryTitle")} (${daySummary.orderCount} orders)`,
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
      const res = await printReceiptSilent(await attachReceiptLogo(payload));
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

  async function handleSystemPrintDaySummary() {
    const payload = buildDaySummaryPrintPayload();
    if (!payload) return;

    setError(null);
    const res = printReceiptSystemDialog(await attachReceiptLogo(payload));
    if (!res.ok) setError(res.error ?? t("pos.order.receiptPrintFailed"));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pos.history.title")}
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
      {orders.length === 0 && !error ? (
        <p className="text-lg text-stone-500">{t("pos.history.empty")}</p>
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
          title={t("pos.history.daySummaryTitle")}
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
