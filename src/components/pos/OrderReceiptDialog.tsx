"use client";

import { OrderStatus } from "@prisma/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EditableOrderReceiptView } from "@/components/EditableOrderReceiptView";
import { OrderReceiptView } from "@/components/OrderReceiptView";
import { ReceiptModal } from "@/components/ReceiptModal";
import { ikassirInvoke } from "@/lib/electron-api";
import type { PosOrderDetail } from "@/lib/pos/order-list-row";
import {
  calcReceiptTotals,
  receiptLinesForFull,
  type ReceiptLine,
  type ReceiptTotals,
} from "@/lib/pos/receipt-print";
import { printReceiptInBrowser } from "@/lib/pos/print-receipt-browser";
import {
  buildReceiptPrintPayload,
  receiptCustomerLabel,
  receiptPrintLabels,
} from "@/lib/pos/receipt-print-payload";
import { useTranslations } from "@/lib/i18n/LocaleProvider";
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
  /** Called after order is closed from elsewhere; optional refresh hook. */
};

export function OrderReceiptDialog({ orderId, onClose }: OrderReceiptDialogProps) {
  const t = useTranslations();
  const [order, setOrder] = useState<PosOrderDetail | null>(null);
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [printBusy, setPrintBusy] = useState(false);

  const venueName = settings?.venue_name ?? "Coffee Shop";
  const servicePct = settings?.service_fee_percent ?? "10";
  const deliveryFee = settings?.delivery_fee_tmt ?? "3";

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
          ikassirInvoke<{ ok: true; order: PosOrderDetail } | { ok: false; error?: string }>(
            "orders.get",
            { id: orderId },
          ),
          ikassirInvoke<Record<string, string>>("settings.getAll"),
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
    const deliveryRaw = Number.parseFloat(deliveryFee);
    return calcReceiptTotals(order.type, receiptVisibleLines, {
      serviceFeePercent: Number.isFinite(pct) ? pct : 10,
      fullDeliveryFeeTmt:
        order.deliveryFeeTmt || (Number.isFinite(deliveryRaw) ? deliveryRaw : 3),
      includeDelivery: true,
    });
  }, [printJob, order, receiptVisibleLines, servicePct, deliveryFee]);

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

  function handlePrintReceipt() {
    if (!printJob || !order || !receiptDisplayTotals || receiptVisibleLines.length === 0) return;

    const session = readSession();
    if (!session) return;
    const labels = receiptPrintLabels(t);
    labels.footer = settings?.receipt_footer ?? labels.footer;
    const payload = buildReceiptPrintPayload({
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

    setPrintBusy(true);
    setError(null);
    const res = printReceiptInBrowser(payload);
    if (!res.ok) setError(res.error ?? t("pos.order.receiptPrintFailed"));
    setPrintBusy(false);
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
      onPrint={() => handlePrintReceipt()}
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
          deliveryFee={deliveryFee}
          onToggleLine={toggleLineOnReceipt}
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
          deliveryFee={deliveryFee}
          t={t}
        />
      )}
    </ReceiptModal>
  );
}
