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
import { ikassirInvoke } from "@/lib/electron-api";
import { waitForPendingOrderDiscard } from "@/lib/pos/discard-empty-order";
import type { PosOrderListRow } from "@/lib/pos/order-list-row";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";

const btnAction =
  "min-h-[44px] touch-manipulation rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-base font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50";

export default function PosHistoryPage() {
  const t = useTranslations();
  const { locale } = useLocale();
  const [orders, setOrders] = useState<PosOrderListRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [daySummary, setDaySummary] = useState<DaySummaryData | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      await waitForPendingOrderDiscard();
      const list = await ikassirInvoke<PosOrderListRow[]>("orders.listToday");
      setOrders(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  const {
    receiptOrderId,
    openReceipt,
    closeReceipt,
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
      const summary = await ikassirInvoke<DaySummaryData>("orders.daySummary");
      setDaySummary(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load summary");
    } finally {
      setSummaryBusy(false);
    }
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

      <OrderReceiptDialog orderId={receiptOrderId} onClose={closeReceipt} />

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
