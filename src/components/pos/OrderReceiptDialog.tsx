"use client";

import { OrderStatus } from "@prisma/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EditableOrderReceiptView } from "@/components/EditableOrderReceiptView";
import { OrderReceiptView } from "@/components/OrderReceiptView";
import { ReceiptModal } from "@/components/ReceiptModal";
import { unikassaInvoke } from "@/lib/electron-api";
import type { PosOrderDetail } from "@/lib/pos/order-list-row";
import {
  calcReceiptTotals,
  receiptLinesForFull,
  type ReceiptLine,
  type ReceiptTotals,
} from "@/lib/pos/receipt-print";
import { printReceiptSilent, printReceiptSystemDialog } from "@/lib/pos/print-receipt";
import {
  buildReceiptPrintPayload,
  receiptCustomerLabel,
  receiptPrintLabels,
} from "@/lib/pos/receipt-print-payload";
import { useTranslations } from "@/lib/i18n/LocaleProvider";
import { DELIVERY_FEE_STEP_TMT } from "@/lib/pos/delivery-fee";
import { readSession } from "@/lib/session";
import { OrderType } from "@prisma/client";

type PrintJob = {
  allLines: ReceiptLine[];
  omittedLineIds: string[];
  editable: boolean;
  totals?: ReceiptTotals;
};

type OrderReceiptDialogProps = {
  orderId: string | null;
  onClose: () => void;
  /** Called when an open order is mutated from the receipt (fees, etc.). */
  onOrderUpdated?: () => void | Promise<void>;
};

export function OrderReceiptDialog({ orderId, onClose, onOrderUpdated }: OrderReceiptDialogProps) {
  const t = useTranslations();
  const [order, setOrder] = useState<PosOrderDetail | null>(null);
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [printBusy, setPrintBusy] = useState(false);

  const venueName = settings?.venue_name ?? "Coffee Shop";
  const servicePct = settings?.service_fee_percent ?? "10";
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

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setPrintJob(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPrintJob(null);

    void (async () => {
      try {
        const [orderRes, cfg] = await Promise.all([
          unikassaInvoke<{ ok: true; order: PosOrderDetail } | { ok: false; error?: string }>(
            "orders.get",
            { id: orderId },
          ),
          unikassaInvoke<Record<string, string>>("settings.getAll"),
        ]);
        if (cancelled) return;
        if (!orderRes.ok) {
          setError(orderRes.error ?? "Order not found");
          setOrder(null);
          return;
        }
        setSettings(cfg);
        setOrder(orderRes.order);
        const editable = orderRes.order.status === OrderStatus.OPEN;
        if (orderRes.order.lines.length > 0) {
          setPrintJob({
            allLines: receiptLinesForFull(orderRes.order.lines),
            omittedLineIds: [],
            editable,
            totals: editable
              ? undefined
              : {
                  subtotalTmt: orderRes.order.subtotalTmt,
                  serviceFeeTmt: orderRes.order.serviceFeeTmt,
                  deliveryFeeTmt: orderRes.order.deliveryFeeTmt,
                  totalTmt: orderRes.order.totalTmt,
                  serviceFeeWaived: orderRes.order.serviceFeeWaived,
                },
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const receiptVisibleLines = useMemo(() => {
    if (!printJob) return [];
    return printJob.allLines.filter((l) => !printJob.omittedLineIds.includes(l.id));
  }, [printJob]);

  const receiptDisplayTotals = useMemo((): ReceiptTotals | null => {
    if (!printJob || !order) return null;
    if (!printJob.editable && printJob.totals) return printJob.totals;
    const pct = Number.parseFloat(servicePct);
    return calcReceiptTotals(order.type, receiptVisibleLines, {
      serviceFeePercent: Number.isFinite(pct) ? pct : 10,
      fullDeliveryFeeTmt: order.deliveryFeeTmt,
      includeDelivery: true,
      serviceFeeWaived: order.serviceFeeWaived,
    });
  }, [printJob, order, receiptVisibleLines, servicePct]);

  async function toggleServiceFeeWaived() {
    if (!orderId || !order || order.status !== OrderStatus.OPEN || order.type !== OrderType.TABLE) {
      return;
    }
    const session = readSession();
    if (!session) return;
    setError(null);
    try {
      const res = await unikassaInvoke<{ ok: boolean; order?: PosOrderDetail; error?: string }>(
        "orders.setServiceFeeWaived",
        {
          orderId,
          waived: !order.serviceFeeWaived,
          actorUserId: session.id,
        },
      );
      if (!res.ok || !res.order) {
        setError(res.error ?? "Update failed");
        return;
      }
      setOrder(res.order);
      if (printJob?.editable) {
        setPrintJob((j) => (j ? { ...j, totals: undefined } : j));
      }
      await onOrderUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function adjustDeliveryFee(delta: number) {
    if (
      !orderId ||
      !order ||
      order.status !== OrderStatus.OPEN ||
      order.type !== OrderType.TAKEAWAY_DELIVERY
    ) {
      return;
    }
    const session = readSession();
    if (!session) return;
    setError(null);
    try {
      const res = await unikassaInvoke<{ ok: boolean; order?: PosOrderDetail; error?: string }>(
        "orders.adjustDeliveryFee",
        { orderId, delta, actorUserId: session.id },
      );
      if (!res.ok || !res.order) {
        setError(res.error ?? "Update failed");
        return;
      }
      setOrder(res.order);
      if (printJob?.editable) {
        setPrintJob((j) => (j ? { ...j, totals: undefined } : j));
      }
      await onOrderUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  function toggleLineOnReceipt(lineId: string) {
    setPrintJob((j) => {
      if (!j?.editable) return j;
      const omitted = j.omittedLineIds.includes(lineId)
        ? j.omittedLineIds.filter((id) => id !== lineId)
        : [...j.omittedLineIds, lineId];
      return { ...j, omittedLineIds: omitted };
    });
  }

  function resetReceiptLines() {
    setPrintJob((j) => (j?.editable ? { ...j, omittedLineIds: [] } : j));
  }

  function handleClose() {
    setPrintJob(null);
    setOrder(null);
    onClose();
  }

  function buildPrintPayload() {
    if (!printJob || !order || !receiptDisplayTotals) return null;
    const session = readSession();
    if (!session) return null;
    const labels = receiptPrintLabels(t);
    labels.footer = settings?.receipt_footer ?? labels.footer;
    return buildReceiptPrintPayload({
      venueName,
      venueAddress: settings?.venue_address ?? "",
      cashierName: session.displayName,
      customerLabel: receiptCustomerLabel(
        order.type,
        orderTypeLabel(order.type),
        order.table?.label ?? null,
      ),
      timestamp: order.openedAt,
      orderType: order.type,
      lines: receiptVisibleLines,
      totals: receiptDisplayTotals,
      labels,
      servicePct,
    });
  }

  async function handlePrintReceipt() {
    const payload = buildPrintPayload();
    if (!payload || receiptVisibleLines.length === 0) return;

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

  function handleSystemPrint() {
    const payload = buildPrintPayload();
    if (!payload || receiptVisibleLines.length === 0) return;

    setError(null);
    const res = printReceiptSystemDialog(payload);
    if (!res.ok) setError(res.error ?? t("pos.order.receiptPrintFailed"));
  }

  if (!orderId) return null;

  if (loading) {
    return (
      <ReceiptModal open onClose={handleClose} title={t("pos.order.printReceiptFull")}>
        <p className="text-stone-500">{t("common.loading")}</p>
      </ReceiptModal>
    );
  }

  if (error || !order || !printJob || !receiptDisplayTotals) {
    return (
      <ReceiptModal open onClose={handleClose} title={t("pos.order.printReceiptFull")}>
        <p className="text-red-800">{error ?? t("pos.order.none")}</p>
      </ReceiptModal>
    );
  }

  return (
    <ReceiptModal
      open
      onClose={handleClose}
      title={t("pos.order.printReceiptFull")}
      onReset={
        printJob.editable && printJob.omittedLineIds.length > 0 ? resetReceiptLines : undefined
      }
      onPrint={() => void handlePrintReceipt()}
      onSystemPrint={handleSystemPrint}
      printBusy={printBusy}
    >
      {printJob.editable ? (
        <EditableOrderReceiptView
          venueName={venueName}
          orderId={order.id}
          orderType={order.type}
          tableLabel={order.table?.label ?? null}
          timestamp={order.openedAt}
          allLines={printJob.allLines}
          omittedLineIds={printJob.omittedLineIds}
          totals={receiptDisplayTotals}
          orderTypeLabel={orderTypeLabel}
          servicePct={servicePct}
          onToggleLine={toggleLineOnReceipt}
          onToggleServiceFee={() => void toggleServiceFeeWaived()}
          onDecreaseDeliveryFee={() => void adjustDeliveryFee(-DELIVERY_FEE_STEP_TMT)}
          onIncreaseDeliveryFee={() => void adjustDeliveryFee(DELIVERY_FEE_STEP_TMT)}
          t={t}
        />
      ) : (
        <OrderReceiptView
          venueName={venueName}
          orderId={order.id}
          orderType={order.type}
          tableLabel={order.table?.label ?? null}
          timestamp={order.closedAt ?? order.openedAt}
          lines={receiptVisibleLines}
          totals={receiptDisplayTotals}
          orderTypeLabel={orderTypeLabel}
          servicePct={servicePct}
          t={t}
        />
      )}
    </ReceiptModal>
  );
}
