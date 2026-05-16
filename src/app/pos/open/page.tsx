"use client";

import { PageHeader } from "@/components/PageHeader";
import { OrderReceiptDialog } from "@/components/pos/OrderReceiptDialog";
import { PosOrderListCard } from "@/components/pos/PosOrderListCard";
import { PosOrderListGrid, PosOrderListGridItem } from "@/components/pos/PosOrderListGrid";
import { usePosOrderListActions } from "@/components/pos/usePosOrderListActions";
import { useCallback, useEffect, useState } from "react";
import { OrderType } from "@prisma/client";
import { ikassirInvoke } from "@/lib/electron-api";
import { waitForPendingOrderDiscard } from "@/lib/pos/discard-empty-order";
import type { PosOrderListRow } from "@/lib/pos/order-list-row";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";

export default function PosOpenOrdersPage() {
  const t = useTranslations();
  const { locale } = useLocale();
  const [orders, setOrders] = useState<PosOrderListRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      await waitForPendingOrderDiscard();
      const list = await ikassirInvoke<PosOrderListRow[]>("orders.listOpen");
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
  } = usePosOrderListActions(load);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pos.open.title")}
        showBack={false}
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
      <PosOrderListGrid>
        {orders.map((o) => (
          <PosOrderListGridItem key={o.id}>
            <PosOrderListCard
              order={o}
              locale={locale}
              typeLabel={typeLabel}
              statusLabel={t("pos.open.badge")}
              t={t}
              onReceipt={() => openReceipt(o.id)}
              onPayClose={() => void payClose(o)}
              receiptBusy={receiptOrderId === o.id}
              payCloseBusy={payCloseBusyId === o.id}
            />
          </PosOrderListGridItem>
        ))}
      </PosOrderListGrid>
      {orders.length === 0 && !error ? (
        <p className="text-lg text-stone-500">{t("pos.open.empty")}</p>
      ) : null}

      <OrderReceiptDialog orderId={receiptOrderId} onClose={closeReceipt} />
    </div>
  );
}
