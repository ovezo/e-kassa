"use client";

import { OrderStatus } from "@prisma/client";
import { useCallback, useState } from "react";
import { ikassirInvoke } from "@/lib/electron-api";
import { formatTmt } from "@/lib/format-money";
import type { PosOrderListRow } from "@/lib/pos/order-list-row";
import { useTranslations } from "@/lib/i18n/LocaleProvider";
import { readSession } from "@/lib/session";

export function usePosOrderListActions(onOrdersChange: () => void | Promise<void>) {
  const t = useTranslations();
  const session = readSession();
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);
  const [payCloseBusyId, setPayCloseBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openReceipt = useCallback((orderId: string) => {
    setReceiptOrderId(orderId);
  }, []);

  const closeReceipt = useCallback(() => {
    setReceiptOrderId(null);
  }, []);

  const payClose = useCallback(
    async (order: PosOrderListRow) => {
      if (!session || order.status !== OrderStatus.OPEN) return;
      if (!confirm(t("pos.order.closeConfirm", { total: formatTmt(order.totalTmt) }))) return;

      setPayCloseBusyId(order.id);
      try {
        const res = await ikassirInvoke<{ ok: boolean; error?: string }>("orders.close", {
          orderId: order.id,
          actorUserId: session.id,
        });
        if (!res.ok) {
          alert(res.error ?? "Close failed");
          return;
        }
        await onOrdersChange();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Close failed");
      } finally {
        setPayCloseBusyId(null);
      }
    },
    [session, t, onOrdersChange],
  );

  const deleteOrder = useCallback(
    async (order: PosOrderListRow) => {
      if (!session || session.role !== "ADMIN") return;
      const total = formatTmt(order.totalTmt);
      const message =
        order.status === OrderStatus.OPEN
          ? t("pos.history.deleteConfirmOpen", { total })
          : t("pos.history.deleteConfirm", { total });
      if (!confirm(message)) return;

      setDeletingId(order.id);
      try {
        const res = await ikassirInvoke<{ ok: boolean; error?: string }>("orders.delete", {
          orderId: order.id,
          actorUserId: session.id,
        });
        if (!res.ok) {
          alert(res.error ?? t("pos.history.deleteFailed"));
          return;
        }
        await onOrdersChange();
      } catch (e) {
        alert(e instanceof Error ? e.message : t("pos.history.deleteFailed"));
      } finally {
        setDeletingId(null);
      }
    },
    [session, t, onOrdersChange],
  );

  return {
    session,
    receiptOrderId,
    openReceipt,
    closeReceipt,
    payClose,
    payCloseBusyId,
    deleteOrder,
    deletingId,
    isAdmin: session?.role === "ADMIN",
  };
}
