"use client";

import { OrderStatus, OrderType } from "@prisma/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ikassirInvoke } from "@/lib/electron-api";
import { formatTmt } from "@/lib/format-money";
import {
  baselinePrintedQty,
  calcReceiptTotals,
  commitPrintedAfterPrint,
  hasAnyNewItems,
  lineHasPrintedQty,
  lineNewQty,
  receiptLinesForFull,
  receiptLinesForNewItems,
  syncPrintedQty,
  type ReceiptLine,
  type ReceiptTotals,
} from "@/lib/pos/receipt-print";
import { readSession, type SessionUser } from "@/lib/session";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

const btn =
  "min-h-[44px] touch-manipulation rounded-xl border border-stone-300 bg-white px-3 py-2 text-base font-medium text-stone-800 hover:bg-stone-50 active:scale-[0.99] disabled:opacity-50";
const btnPrimary =
  "min-h-[52px] w-full touch-manipulation rounded-xl bg-stone-900 px-4 py-3 text-base font-semibold text-white hover:bg-stone-800 active:scale-[0.99] disabled:opacity-50";
const btnReceipt =
  "min-h-[48px] flex-1 touch-manipulation rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-base font-medium text-amber-950 hover:bg-amber-100 active:scale-[0.99] disabled:opacity-50";
const btnDanger =
  "min-h-[44px] touch-manipulation rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-50";

type OrderLine = {
  id: string;
  productId: string | null;
  productName: string;
  unitPriceTmt: number;
  qty: number;
  lineTotalTmt: number;
};

type OrderDetail = {
  id: string;
  type: OrderType;
  status: OrderStatus;
  openedAt: string;
  closedAt: string | null;
  tableId: string | null;
  table: { id: string; label: string } | null;
  lines: OrderLine[];
  subtotalTmt: number;
  serviceFeeTmt: number;
  deliveryFeeTmt: number;
  totalTmt: number;
  openedBy: { id: string; displayName: string };
};

type CategoryRow = { id: string; name: string; sortOrder: number; active: boolean };
type ProductRow = {
  id: string;
  name: string;
  priceTmt: number;
  categoryId: string;
  active: boolean;
  sortOrder: number;
};

type TableListRow = { id: string; label: string; active: boolean };

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** URL-driven new order before first menu item (no DB row yet). */
function parseNewOrderDraft(search: URLSearchParams): { type: OrderType; tableId: string | null } | null {
  const typeRaw = search.get("type");
  if (!typeRaw) return null;
  const tableParam = search.get("tableId");
  const tableId = tableParam?.trim() || null;

  if (typeRaw === OrderType.TABLE) {
    if (!tableId) return null;
    return { type: OrderType.TABLE, tableId };
  }
  if (typeRaw === OrderType.TAKEAWAY_PICKUP || typeRaw === OrderType.TAKEAWAY_DELIVERY) {
    if (tableId) return null;
    return { type: typeRaw, tableId: null };
  }
  return null;
}

function ReceiptPrintView({
  venueName,
  orderId,
  orderType,
  tableLabel,
  timestamp,
  lines,
  totals,
  orderTypeLabel,
  servicePct,
  deliveryFee,
  t,
}: {
  venueName: string;
  orderId: string;
  orderType: OrderType;
  tableLabel: string | null;
  timestamp: string;
  lines: ReceiptLine[];
  totals: ReceiptTotals;
  orderTypeLabel: (type: OrderType) => string;
  servicePct: string;
  deliveryFee: string;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  return (
    <div className="fixed inset-0 z-[9999] hidden bg-white p-6 print:block">
      <div className="mx-auto max-w-md text-center text-sm">
        <div className="text-xl font-bold">{venueName}</div>
        <div className="mt-2 text-stone-600">{new Date(timestamp).toLocaleString()}</div>
        <div className="mt-1 font-mono text-xs">
          {t("pos.order.printOrderId")} {orderId.slice(0, 8)}…
        </div>
        <div className="mt-1">
          {orderTypeLabel(orderType)}
          {tableLabel ? ` · ${tableLabel}` : ""}
        </div>
        <div className="mt-4 text-left text-sm">
          {lines.map((l) => (
            <div key={l.id} className="flex justify-between border-b border-stone-200 py-1">
              <span>
                {l.productName} ×{l.qty}
              </span>
              <span>{formatTmt(l.lineTotalTmt)}</span>
            </div>
          ))}
        </div>
        <dl className="mt-4 space-y-1 border-t border-stone-300 pt-2 text-left text-sm">
          <div className="flex justify-between text-stone-600">
            <dt>{t("pos.order.subtotal")}</dt>
            <dd className="font-medium text-stone-900">{formatTmt(totals.subtotalTmt)}</dd>
          </div>
          {orderType === OrderType.TABLE && totals.serviceFeeTmt > 0 ? (
            <div className="flex justify-between text-stone-600">
              <dt>{t("pos.order.service", { pct: servicePct })}</dt>
              <dd className="font-medium text-stone-900">{formatTmt(totals.serviceFeeTmt)}</dd>
            </div>
          ) : null}
          {orderType === OrderType.TAKEAWAY_DELIVERY && totals.deliveryFeeTmt > 0 ? (
            <div className="flex justify-between text-stone-600">
              <dt>{t("pos.order.deliveryLine", { fee: deliveryFee })}</dt>
              <dd className="font-medium text-stone-900">{formatTmt(totals.deliveryFeeTmt)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-stone-900 pt-2 text-base font-bold text-stone-900">
            <dt>{t("pos.order.total")}</dt>
            <dd>{formatTmt(totals.totalTmt)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function buildPreviewOrder(
  draft: { type: OrderType; tableId: string | null },
  tableLabel: string | null,
  session: SessionUser,
  settings: Record<string, string> | null,
): OrderDetail {
  const dRaw = Number.parseFloat(settings?.delivery_fee_tmt ?? "3");
  const deliveryFeeTmt =
    draft.type === OrderType.TAKEAWAY_DELIVERY
      ? roundMoney(Number.isFinite(dRaw) ? dRaw : 3)
      : 0;
  return {
    id: "",
    type: draft.type,
    status: OrderStatus.OPEN,
    openedAt: new Date().toISOString(),
    closedAt: null,
    tableId: draft.tableId,
    table: draft.tableId && tableLabel ? { id: draft.tableId, label: tableLabel } : null,
    lines: [],
    subtotalTmt: 0,
    serviceFeeTmt: 0,
    deliveryFeeTmt,
    totalTmt: deliveryFeeTmt,
    openedBy: { id: session.id, displayName: session.displayName },
  };
}

export function OrderWorkspace() {
  const router = useRouter();
  const search = useSearchParams();
  const orderId = search.get("id");
  const session = readSession();
  const t = useTranslations();

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

  const draftSig = search.toString();
  const draft = useMemo(() => parseNewOrderDraft(new URLSearchParams(draftSig)), [draftSig]);

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [draftTableLabel, setDraftTableLabel] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [venueName, setVenueName] = useState("Coffee Shop");
  /** Per line id: qty already sent to kitchen / printed on a receipt this visit. */
  const [printedQty, setPrintedQty] = useState<Record<string, number>>({});
  const [printJob, setPrintJob] = useState<{
    mode: "full" | "new";
    lines: ReceiptLine[];
    totals: ReceiptTotals;
    commitCheckpoint: boolean;
  } | null>(null);
  const printLinesRef = useRef<OrderLine[]>([]);
  /** Order ids already baselined this visit (reopened open order). */
  const visitBaselinedOrderId = useRef<string | null>(null);
  /** Skip baseline right after creating a new order in this session. */
  const skipBaselineOrderId = useRef<string | null>(null);

  const storeProducts = useMemo(() => products.filter((p) => p.active), [products]);

  const categoriesSorted = useMemo(
    () =>
      [...categories].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [categories],
  );

  const productsByCategory = useMemo(() => {
    const m = new Map<string, ProductRow[]>();
    for (const p of storeProducts) {
      const arr = m.get(p.categoryId) ?? [];
      arr.push(p);
      m.set(p.categoryId, arr);
    }
    for (const list of m.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    }
    return m;
  }, [storeProducts]);

  const loadOrder = useCallback(async () => {
    if (!orderId) return;
    const o = await ikassirInvoke<{ ok: true; order: OrderDetail } | { ok: false; error: string }>(
      "orders.get",
      { id: orderId },
    );
    if (!o.ok) {
      setError(o.error ?? "Order not found");
      setOrder(null);
      return;
    }
    setOrder(o.order);
  }, [orderId]);

  const loadCatalog = useCallback(async () => {
    const [cats, prods, cfg] = await Promise.all([
      ikassirInvoke<CategoryRow[]>("categories.list"),
      ikassirInvoke<ProductRow[]>("products.list", {}),
      ikassirInvoke<Record<string, string>>("settings.getAll"),
    ]);
    setCategories(cats.filter((c) => c.active));
    setProducts(prods);
    setSettings(cfg);
    setVenueName(cfg.venue_name ?? "Coffee Shop");
  }, []);

  useEffect(() => {
    const d = parseNewOrderDraft(new URLSearchParams(draftSig));
    if (!orderId && !d) {
      setLoading(false);
      setOrder(null);
      setDraftTableLabel(null);
      return;
    }

    setLoading(true);
    setError(null);
    void (async () => {
      try {
        if (orderId) {
          await Promise.all([loadOrder(), loadCatalog()]);
        } else if (d) {
          setOrder(null);
          await loadCatalog();
          if (d.type === OrderType.TABLE && d.tableId) {
            const list = await ikassirInvoke<TableListRow[]>("tables.list");
            const tblRow = list.find((x) => x.id === d.tableId);
            if (!tblRow?.active) {
              setDraftTableLabel(null);
              setError(t("pos.order.tableInvalid"));
            } else {
              setDraftTableLabel(tblRow.label);
            }
          } else {
            setDraftTableLabel(null);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId, draftSig, loadOrder, loadCatalog, t]);

  const effectiveOrderId = order?.id ?? orderId;

  const viewOrder = useMemo((): OrderDetail | null => {
    if (order) return order;
    if (draft && session && !orderId) return buildPreviewOrder(draft, draftTableLabel, session, settings);
    return null;
  }, [order, draft, session, orderId, draftTableLabel, settings]);

  useEffect(() => {
    visitBaselinedOrderId.current = null;
    skipBaselineOrderId.current = null;
    setPrintJob(null);
  }, [effectiveOrderId]);

  useEffect(() => {
    if (!order?.id || !viewOrder) return;

    if (order.status === OrderStatus.OPEN && visitBaselinedOrderId.current !== order.id) {
      visitBaselinedOrderId.current = order.id;
      if (skipBaselineOrderId.current === order.id) {
        skipBaselineOrderId.current = null;
        setPrintedQty({});
        return;
      }
      setPrintedQty(baselinePrintedQty(viewOrder.lines));
      return;
    }

    setPrintedQty((prev) => syncPrintedQty(prev, viewOrder.lines));
  }, [order?.id, order?.status, viewOrder?.lines]);

  const canAddFromMenu =
    !!session &&
    (Boolean(draft && !orderId && !error) || Boolean(order && order.status === OrderStatus.OPEN));

  const orderIsOpen = order?.status === OrderStatus.OPEN;

  async function addProduct(productId: string) {
    if (!session || !canAddFromMenu) return;
    setBusy(true);
    setError(null);
    try {
      if (draft && !orderId && !order) {
        const res = await ikassirInvoke<{
          ok: boolean;
          order?: OrderDetail;
          error?: string;
        }>("orders.createWithLine", {
          type: draft.type,
          tableId: draft.tableId,
          productId,
          qty: 1,
          actorUserId: session.id,
        });
        if (!res.ok || !res.order) {
          setError(res.error ?? "Could not add item");
          return;
        }
        skipBaselineOrderId.current = res.order.id;
        visitBaselinedOrderId.current = res.order.id;
        setPrintedQty({});
        setOrder(res.order);
        router.replace(`/pos/order?id=${res.order.id}`);
        return;
      }

      const oid = effectiveOrderId;
      if (!oid || !orderIsOpen) return;
      const res = await ikassirInvoke<{ ok: boolean; order?: OrderDetail; error?: string }>(
        "orders.addLine",
        { orderId: oid, productId, qty: 1, actorUserId: session.id },
      );
      if (!res.ok || !res.order) setError(res.error ?? "Could not add item");
      else setOrder(res.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function setQty(lineId: string, qty: number) {
    const oid = effectiveOrderId;
    if (!oid || !session || !orderIsOpen) return;
    setBusy(true);
    setError(null);
    try {
      const res = await ikassirInvoke<{ ok: boolean; order?: OrderDetail; error?: string }>(
        "orders.updateLineQty",
        { orderId: oid, lineId, qty, actorUserId: session.id },
      );
      if (!res.ok || !res.order) setError(res.error ?? "Update failed");
      else setOrder(res.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeLine(lineId: string) {
    const oid = effectiveOrderId;
    if (!oid || !session || !orderIsOpen) return;
    setBusy(true);
    setError(null);
    try {
      const res = await ikassirInvoke<
        | { ok: true; order: OrderDetail }
        | { ok: true; abandoned: true }
        | { ok: false; error?: string }
      >("orders.removeLine", { orderId: oid, lineId, actorUserId: session.id });
      if (!res.ok) {
        setError("error" in res ? (res.error ?? "Remove failed") : "Remove failed");
        return;
      }
      if ("abandoned" in res && res.abandoned) {
        setOrder(null);
        router.push("/pos/create");
        return;
      }
      if ("order" in res && res.order) setOrder(res.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function closeOrder() {
    const oid = effectiveOrderId;
    if (!oid || !session || !order || !orderIsOpen) return;
    if (!confirm(t("pos.order.closeConfirm", { total: formatTmt(order.totalTmt) }))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await ikassirInvoke<{ ok: boolean; order?: OrderDetail; error?: string }>(
        "orders.close",
        { orderId: oid, actorUserId: session.id },
      );
      if (!res.ok || !res.order) setError(res.error ?? "Close failed");
      else {
        setOrder(res.order);
        router.push("/pos/history");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const hasPrintedOnce = useMemo(
    () => Object.values(printedQty).some((q) => q > 0),
    [printedQty],
  );

  const hasNewItems = useMemo(
    () => (viewOrder ? hasAnyNewItems(printedQty, viewOrder.lines) : false),
    [printedQty, viewOrder],
  );

  function startReceiptPrint(mode: "full" | "new") {
    if (!viewOrder || viewOrder.lines.length === 0) return;
    const lines =
      mode === "full"
        ? receiptLinesForFull(viewOrder.lines)
        : receiptLinesForNewItems(printedQty, viewOrder.lines);
    if (lines.length === 0) return;

    const pct = Number.parseFloat(settings?.service_fee_percent ?? "10");
    const deliveryRaw = Number.parseFloat(settings?.delivery_fee_tmt ?? "3");
    const totals = calcReceiptTotals(viewOrder.type, lines, {
      serviceFeePercent: Number.isFinite(pct) ? pct : 10,
      fullDeliveryFeeTmt:
        viewOrder.deliveryFeeTmt || (Number.isFinite(deliveryRaw) ? deliveryRaw : 3),
      includeDelivery: mode === "full",
    });

    printLinesRef.current = viewOrder.lines;
    setPrintJob({ mode, lines, totals, commitCheckpoint: true });
  }

  useEffect(() => {
    if (!printJob) return;
    const job = printJob;
    const raf = requestAnimationFrame(() => {
      window.print();
      if (job.commitCheckpoint) {
        setPrintedQty((prev) =>
          commitPrintedAfterPrint(prev, printLinesRef.current, job.mode),
        );
      }
      setPrintJob(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [printJob]);

  if (!orderId && !draft) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("pos.order.title")} backHref="/pos" />
        <p className="text-stone-600">{t("pos.order.none")}</p>
        <Link href="/pos/create" className="text-amber-900 underline">
          {t("pos.order.createLink")}
        </Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("pos.order.title")} backHref="/pos" />
        <p className="text-stone-600">{t("pos.order.needLogin")}</p>
        <Link href="/login" className="text-amber-900 underline">
          {t("pos.order.loginLink")}
        </Link>
      </div>
    );
  }

  if (loading) {
    return <p className="text-lg text-stone-500">{t("pos.order.loading")}</p>;
  }

  if (orderId && error && !order) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("pos.order.title")} backHref="/pos/open" />
        <p className="rounded-xl bg-red-50 px-4 py-3 text-red-800">{error}</p>
        <Link href="/pos/open" className={btn}>
          {t("pos.nav.openOrders")}
        </Link>
      </div>
    );
  }

  if (!viewOrder) return null;

  const servicePct = settings?.service_fee_percent ?? "10";
  const deliveryFee = settings?.delivery_fee_tmt ?? "3";
  const isPreview = !orderId && draft != null && order == null;
  const subtitle = isPreview
    ? t("pos.order.previewHint")
    : `${viewOrder.status === OrderStatus.OPEN ? t("pos.order.statusOpen") : t("pos.order.statusClosed")} · ${viewOrder.openedBy.displayName}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden print:min-h-0 print:overflow-visible print:gap-2">
      <div className="shrink-0 print:hidden">
        <PageHeader
          title={
            <>
              {orderTypeLabel(viewOrder.type)}
              {viewOrder.table ? ` · ${viewOrder.table.label}` : ""}
            </>
          }
          subtitle={subtitle}
          subtitleClassName="text-sm text-stone-500"
          backHref="/pos/open"
        />
      </div>

      {error ? (
        <p className="shrink-0 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-950 print:hidden">{error}</p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-2xl border border-stone-200 bg-stone-50/50 print:hidden lg:flex-row">
        <section className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 lg:border-r lg:border-stone-200 lg:p-5">
          <h2 className="mb-4 text-lg font-semibold text-stone-800">{t("pos.order.menu")}</h2>
          <div className="space-y-10">
            {categoriesSorted.map((cat) => {
              const plist = productsByCategory.get(cat.id) ?? [];
              if (plist.length === 0) return null;
              return (
                <div key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-2">
                  <h3 className="mb-3 border-b border-stone-200 pb-2 text-xl font-semibold text-stone-900">
                    {cat.name}
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                    {plist.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={busy || !canAddFromMenu}
                        onClick={() => void addProduct(p.id)}
                        className="flex min-h-[96px] touch-manipulation flex-col items-start justify-between rounded-2xl border border-stone-200 bg-white p-3 text-left shadow-sm transition hover:border-amber-300 hover:shadow active:scale-[0.98] disabled:opacity-50"
                      >
                        <span className="font-semibold leading-snug text-stone-900">{p.name}</span>
                        <span className="mt-2 text-sm text-stone-600">{formatTmt(p.priceTmt)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="flex max-h-[min(52vh,520px)] min-h-0 w-full shrink-0 flex-col border-t border-stone-200 bg-white lg:max-h-none lg:h-full lg:min-h-0 lg:w-[min(100%,420px)] lg:self-stretch lg:border-l lg:border-t-0">
          <div className="shrink-0 border-b border-stone-100 px-4 py-3 lg:px-5">
            <h2 className="text-lg font-semibold text-stone-800">{t("pos.order.cart")}</h2>
          </div>

          <div className="max-h-[42vh] min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 lg:max-h-none lg:px-5">
            <ul className="divide-y divide-stone-100">
              {viewOrder.lines.length === 0 ? (
                <li className="py-8 text-center text-stone-500">{t("pos.order.cartEmpty")}</li>
              ) : (
                viewOrder.lines.map((line) => {
                  const printed = lineHasPrintedQty(printedQty, line.id);
                  const newQty = lineNewQty(printedQty, line);
                  return (
                  <li
                    key={line.id}
                    className={`py-4 ${printed ? "rounded-xl bg-amber-50/90 -mx-2 px-2" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 font-medium leading-snug text-stone-900">
                        {line.productName}
                        {printed && newQty > 0 ? (
                          <span className="ml-2 text-xs font-medium text-amber-800">
                            {t("pos.order.receiptNewQty", { qty: String(newQty) })}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-base font-semibold text-stone-900">
                        {formatTmt(line.lineTotalTmt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-stone-500">
                      {formatTmt(line.unitPriceTmt)} {t("pos.order.each")}
                    </p>
                    {orderIsOpen ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busy || line.qty <= 1}
                          className={btn}
                          aria-label={t("pos.order.ariaDecrease")}
                          onClick={() => void setQty(line.id, line.qty - 1)}
                        >
                          −
                        </button>
                        <span className="min-w-[2.5rem] text-center text-lg font-semibold tabular-nums">
                          {line.qty}
                        </span>
                        <button
                          type="button"
                          disabled={busy || line.qty >= 99}
                          className={btn}
                          aria-label={t("pos.order.ariaIncrease")}
                          onClick={() => void setQty(line.id, line.qty + 1)}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className={btnDanger}
                          onClick={() => void removeLine(line.id)}
                        >
                          {t("pos.order.remove")}
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-stone-600">
                        {t("pos.order.qtyLabel")} {line.qty}
                      </p>
                    )}
                  </li>
                  );
                })
              )}
            </ul>
          </div>

          <div className="shrink-0 space-y-2 border-t border-stone-200 bg-stone-50/80 px-4 py-4 lg:px-5">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between text-stone-600">
                <dt>{t("pos.order.subtotal")}</dt>
                <dd className="font-medium text-stone-900">{formatTmt(viewOrder.subtotalTmt)}</dd>
              </div>
              {viewOrder.type === OrderType.TABLE ? (
                <div className="flex justify-between text-stone-600">
                  <dt>{t("pos.order.service", { pct: servicePct })}</dt>
                  <dd className="font-medium text-stone-900">{formatTmt(viewOrder.serviceFeeTmt)}</dd>
                </div>
              ) : null}
              {viewOrder.type === OrderType.TAKEAWAY_DELIVERY ? (
                <div className="flex justify-between text-stone-600">
                  <dt>{t("pos.order.deliveryLine", { fee: deliveryFee })}</dt>
                  <dd className="font-medium text-stone-900">{formatTmt(viewOrder.deliveryFeeTmt)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-bold text-stone-900">
                <dt>{t("pos.order.total")}</dt>
                <dd>{formatTmt(viewOrder.totalTmt)}</dd>
              </div>
            </dl>
          </div>

          <div className="shrink-0 border-t border-stone-200 bg-white p-4 lg:p-5 lg:pt-4">
            {viewOrder.status === OrderStatus.OPEN ? (
              <div className="space-y-2">
                {!isPreview && effectiveOrderId ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy || viewOrder.lines.length === 0}
                      className={btnReceipt}
                      onClick={() => startReceiptPrint("full")}
                    >
                      {t("pos.order.printReceiptFull")}
                    </button>
                    <button
                      type="button"
                      disabled={busy || !hasPrintedOnce || !hasNewItems}
                      className={btnReceipt}
                      onClick={() => startReceiptPrint("new")}
                    >
                      {t("pos.order.printReceiptNew")}
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={busy || viewOrder.lines.length === 0 || isPreview}
                  className={btnPrimary}
                  onClick={() => void closeOrder()}
                >
                  {t("pos.order.payClose")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={btnPrimary}
                onClick={() => {
                  if (!order) return;
                  printLinesRef.current = order.lines;
                  setPrintJob({
                    mode: "full",
                    lines: receiptLinesForFull(order.lines),
                    totals: {
                      subtotalTmt: order.subtotalTmt,
                      serviceFeeTmt: order.serviceFeeTmt,
                      deliveryFeeTmt: order.deliveryFeeTmt,
                      totalTmt: order.totalTmt,
                    },
                    commitCheckpoint: false,
                  });
                }}
              >
                {t("pos.order.printReceipt")}
              </button>
            )}
          </div>
        </aside>
      </div>

      {printJob && order?.id ? (
        <ReceiptPrintView
          venueName={venueName}
          orderId={order.id}
          orderType={viewOrder.type}
          tableLabel={viewOrder.table?.label ?? null}
          timestamp={order.closedAt ?? order.openedAt}
          lines={printJob.lines}
          totals={printJob.totals}
          orderTypeLabel={orderTypeLabel}
          servicePct={servicePct}
          deliveryFee={deliveryFee}
          t={t}
        />
      ) : null}
    </div>
  );
}
