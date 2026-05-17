"use client";

import { OrderStatus, OrderType } from "@prisma/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EditableOrderReceiptView } from "@/components/EditableOrderReceiptView";
import { OrderReceiptView } from "@/components/OrderReceiptView";
import { PageHeader } from "@/components/PageHeader";
import { ReceiptModal } from "@/components/ReceiptModal";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ikassirInvoke } from "@/lib/electron-api";
import { formatTmt } from "@/lib/format-money";
import {
  calcReceiptTotals,
  receiptLinesForFull,
  type ReceiptLine,
  type ReceiptTotals,
} from "@/lib/pos/receipt-print";
import { printReceiptSilent, printReceiptSystemDialog } from "@/lib/pos/print-receipt";
import { ServiceFeeRow } from "@/components/pos/ServiceFeeRow";
import {
  buildReceiptPrintPayload,
  receiptCustomerLabel,
  receiptPrintLabels,
} from "@/lib/pos/receipt-print-payload";
import { discardEmptyOrderIfNeeded } from "@/lib/pos/discard-empty-order";
import { readSession } from "@/lib/session";
import { productImageDisplayUrl } from "@/lib/product-image-url";
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
  serviceFeeWaived: boolean;
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
  imageUrl: string | null;
};

const MENU_CATEGORY_VIEW_KEY = "ikassir_menu_category_view";

type MenuCategoryViewMode = "list" | "tabs";

function readStoredMenuViewMode(): MenuCategoryViewMode {
  if (typeof window === "undefined") return "list";
  try {
    const v = window.localStorage.getItem(MENU_CATEGORY_VIEW_KEY);
    return v === "tabs" ? "tabs" : "list";
  } catch {
    return "list";
  }
}

function writeStoredMenuViewMode(mode: MenuCategoryViewMode): void {
  try {
    window.localStorage.setItem(MENU_CATEGORY_VIEW_KEY, mode);
  } catch {
    /* ignore */
  }
}

function ProductMenuImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      alt=""
      className="h-[72px] w-[72px] shrink-0 rounded-xl border border-stone-100 bg-stone-50 object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function ProductTile({
  product,
  disabled,
  onAdd,
}: {
  product: ProductRow;
  disabled: boolean;
  onAdd: (id: string) => void;
}) {
  const imageSrc = productImageDisplayUrl(product.imageUrl);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onAdd(product.id)}
      className="flex min-h-[96px] w-full touch-manipulation flex-row items-stretch justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-3 text-left shadow-sm transition hover:border-amber-300 hover:shadow active:scale-[0.98] disabled:opacity-50"
    >
      <div className="flex min-w-0 flex-1 flex-col items-start justify-between">
        <span className="font-semibold leading-snug text-stone-900">{product.name}</span>
        <span className="mt-2 text-sm text-stone-600">{formatTmt(product.priceTmt)}</span>
      </div>
      {imageSrc ? <ProductMenuImage src={imageSrc} /> : null}
    </button>
  );
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

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [venueName, setVenueName] = useState("Coffee Shop");
  const [printJob, setPrintJob] = useState<{
    allLines: ReceiptLine[];
    omittedLineIds: string[];
    editable: boolean;
    /** Frozen totals for read-only (closed) receipt preview. */
    totals?: ReceiptTotals;
  } | null>(null);
  const [printBusy, setPrintBusy] = useState(false);
  const prevEffectiveOrderIdRef = useRef<string | null | undefined>(undefined);
  const orderRef = useRef(order);
  orderRef.current = order;
  const orderIdRef = useRef(orderId);
  orderIdRef.current = orderId;
  const workspaceMountedRef = useRef(false);

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

  const [menuViewMode, setMenuViewMode] = useState<MenuCategoryViewMode>("list");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const categoriesWithProducts = useMemo(
    () => categoriesSorted.filter((c) => (productsByCategory.get(c.id) ?? []).length > 0),
    [categoriesSorted, productsByCategory],
  );

  useEffect(() => {
    setMenuViewMode(readStoredMenuViewMode());
  }, []);

  useEffect(() => {
    if (categoriesWithProducts.length === 0) {
      setActiveCategoryId(null);
      return;
    }
    setActiveCategoryId((prev) =>
      prev && categoriesWithProducts.some((c) => c.id === prev)
        ? prev
        : categoriesWithProducts[0].id,
    );
  }, [categoriesWithProducts]);

  const setMenuViewModeStored = useCallback((mode: MenuCategoryViewMode) => {
    setMenuViewMode(mode);
    writeStoredMenuViewMode(mode);
  }, []);

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
    if (!orderId) {
      setLoading(false);
      setOrder(null);
      return;
    }

    setLoading(true);
    setError(null);
    void (async () => {
      try {
        await Promise.all([loadOrder(), loadCatalog()]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId, loadOrder, loadCatalog]);

  const handleLeaveToOpen = useCallback(async () => {
    if (!orderId) {
      router.push("/pos/open");
      return;
    }
    await discardEmptyOrderIfNeeded(orderId, orderRef.current);
    router.push("/pos/open");
  }, [orderId, router]);

  useEffect(() => {
    const leavingOnCleanup = orderId;
    if (!leavingOnCleanup) return;

    workspaceMountedRef.current = true;

    return () => {
      workspaceMountedRef.current = false;

      queueMicrotask(() => {
        if (workspaceMountedRef.current && orderIdRef.current === leavingOnCleanup) {
          return;
        }
        void discardEmptyOrderIfNeeded(leavingOnCleanup, orderRef.current);
      });
    };
  }, [orderId]);

  const effectiveOrderId = orderId;

  const viewOrder = order;

  useEffect(() => {
    const current = effectiveOrderId ?? null;
    const prev = prevEffectiveOrderIdRef.current;

    if (prev !== undefined) {
      const switchedOrder =
        prev !== null && current !== null && prev !== current;
      const leftOrder = prev !== null && current === null;
      if (switchedOrder || leftOrder) {
        setPrintJob(null);
      }
    }

    prevEffectiveOrderIdRef.current = current;
  }, [effectiveOrderId]);

  const canAddFromMenu = !!session && order?.status === OrderStatus.OPEN;

  const orderIsOpen = order?.status === OrderStatus.OPEN;

  const receiptVisibleLines = useMemo(() => {
    if (!printJob) return [];
    return printJob.allLines.filter((l) => !printJob.omittedLineIds.includes(l.id));
  }, [printJob]);

  const receiptDisplayTotals = useMemo((): ReceiptTotals | null => {
    if (!printJob || !viewOrder) return null;
    if (!printJob.editable && printJob.totals) return printJob.totals;
    const pct = Number.parseFloat(settings?.service_fee_percent ?? "10");
    const deliveryRaw = Number.parseFloat(settings?.delivery_fee_tmt ?? "3");
    return calcReceiptTotals(viewOrder.type, receiptVisibleLines, {
      serviceFeePercent: Number.isFinite(pct) ? pct : 10,
      fullDeliveryFeeTmt:
        viewOrder.deliveryFeeTmt || (Number.isFinite(deliveryRaw) ? deliveryRaw : 3),
      includeDelivery: true,
      serviceFeeWaived: viewOrder.serviceFeeWaived,
    });
  }, [printJob, viewOrder, receiptVisibleLines, settings]);

  async function toggleServiceFeeWaived() {
    const oid = effectiveOrderId;
    if (!oid || !session || !orderIsOpen || viewOrder?.type !== OrderType.TABLE) return;
    setBusy(true);
    setError(null);
    try {
      const res = await ikassirInvoke<{ ok: boolean; order?: OrderDetail; error?: string }>(
        "orders.setServiceFeeWaived",
        {
          orderId: oid,
          waived: !viewOrder.serviceFeeWaived,
          actorUserId: session.id,
        },
      );
      if (!res.ok || !res.order) setError(res.error ?? "Update failed");
      else setOrder(res.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function addProduct(productId: string) {
    if (!session || !canAddFromMenu || !orderId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await ikassirInvoke<{ ok: boolean; order?: OrderDetail; error?: string }>(
        "orders.addLine",
        { orderId, productId, qty: 1, actorUserId: session.id },
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
      const res = await ikassirInvoke<{ ok: boolean; order?: OrderDetail; error?: string }>(
        "orders.removeLine",
        { orderId: oid, lineId, actorUserId: session.id },
      );
      if (!res.ok || !res.order) {
        setError(res.error ?? "Remove failed");
        return;
      }
      setOrder(res.order);
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

  function closeReceiptModal() {
    setPrintJob(null);
    setPrintBusy(false);
  }

  if (!orderId) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("pos.order.title")} backHref="/pos/open" />
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
        <PageHeader title={t("pos.order.title")} backHref="/pos/open" />
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
  function showReceipt() {
    if (!viewOrder || viewOrder.lines.length === 0 || !orderIsOpen) return;
    setPrintJob({
      allLines: receiptLinesForFull(viewOrder.lines),
      omittedLineIds: [],
      editable: true,
    });
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

  function buildPrintPayload() {
    if (!printJob || !order || !viewOrder || !receiptDisplayTotals || !session) return null;
    const labels = receiptPrintLabels(t);
    labels.footer = settings?.receipt_footer ?? labels.footer;
    return buildReceiptPrintPayload({
      venueName,
      venueAddress: settings?.venue_address ?? "",
      cashierName: session.displayName,
      customerLabel: receiptCustomerLabel(
        viewOrder.type,
        orderTypeLabel(viewOrder.type),
        viewOrder.table?.label ?? null,
      ),
      timestamp: order.openedAt,
      orderType: viewOrder.type,
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
          onBack={handleLeaveToOpen}
          actions={
            <div
              role="group"
              aria-label={t("pos.order.menuViewToggleAria")}
              className="inline-flex rounded-lg border border-stone-300 bg-stone-100 p-px shadow-sm"
            >
              <button
                type="button"
                className={`min-h-8 min-w-[3.25rem] touch-manipulation rounded-md px-2 py-1 text-xs font-semibold leading-tight transition sm:min-h-9 sm:px-2.5 sm:text-[13px] ${
                  menuViewMode === "list"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                }`}
                onClick={() => setMenuViewModeStored("list")}
              >
                {t("pos.order.menuViewList")}
              </button>
              <button
                type="button"
                className={`min-h-8 min-w-[3.25rem] touch-manipulation rounded-md px-2 py-1 text-xs font-semibold leading-tight transition sm:min-h-9 sm:px-2.5 sm:text-[13px] ${
                  menuViewMode === "tabs"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                }`}
                onClick={() => setMenuViewModeStored("tabs")}
              >
                {t("pos.order.menuViewTabs")}
              </button>
            </div>
          }
        />
      </div>

      {error ? (
        <p className="shrink-0 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-950 print:hidden">{error}</p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-row gap-0 overflow-hidden rounded-2xl border border-stone-200 bg-stone-50/50 print:hidden">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-r border-stone-200 p-4 sm:p-5">
          {menuViewMode === "tabs" ? (
            <>
              <div className="shrink-0 overflow-x-auto overscroll-x-contain border-b border-stone-200 pb-3">
                <div className="flex w-max min-w-full gap-1.5">
                  {categoriesWithProducts.map((cat) => {
                    const active = cat.id === activeCategoryId;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className={`shrink-0 touch-manipulation rounded-xl border px-4 py-2.5 text-base font-semibold transition active:scale-[0.99] ${
                          active
                            ? "border-stone-900 bg-stone-900 text-white shadow-sm"
                            : "border-stone-200 bg-white text-stone-800 hover:border-amber-300 hover:bg-amber-50/60"
                        }`}
                        onClick={() => setActiveCategoryId(cat.id)}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-4">
                {activeCategoryId ? (
                  <div className="grid grid-cols-4 gap-3">
                    {(productsByCategory.get(activeCategoryId) ?? []).map((p) => (
                      <ProductTile
                        key={p.id}
                        product={p}
                        disabled={busy || !canAddFromMenu}
                        onAdd={() => void addProduct(p.id)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="space-y-10">
                {categoriesSorted.map((cat) => {
                  const plist = productsByCategory.get(cat.id) ?? [];
                  if (plist.length === 0) return null;
                  return (
                    <div key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-2">
                      <h3 className="mb-3 border-b border-stone-200 pb-2 text-xl font-semibold text-stone-900">
                        {cat.name}
                      </h3>
                      <div className="grid grid-cols-4 gap-3">
                        {plist.map((p) => (
                          <ProductTile
                            key={p.id}
                            product={p}
                            disabled={busy || !canAddFromMenu}
                            onAdd={() => void addProduct(p.id)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <aside className="flex h-full min-h-0 w-[min(100%,300px)] min-w-[300px] shrink-0 flex-col self-stretch border-l border-stone-200 bg-white">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 sm:px-5">
            <ul className="divide-y divide-stone-100">
              {viewOrder.lines.length === 0 ? (
                <li className="py-8 text-center text-stone-500">{t("pos.order.cartEmpty")}</li>
              ) : (
                viewOrder.lines.map((line) => (
                  <li key={line.id} className="py-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 font-medium leading-snug text-stone-900">
                        {line.productName}
                      </span>
                      <span className="shrink-0 text-base font-semibold text-stone-900">
                        {formatTmt(line.lineTotalTmt)}
                      </span>
                    </div>
                    {/* <p className="mt-0.5 text-sm text-stone-500">
                      {formatTmt(line.unitPriceTmt)} {t("pos.order.each")}
                    </p> */}
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
                          className={`${btnDanger} ml-auto`}
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
                ))
              )}
            </ul>
          </div>

          <div className="shrink-0 space-y-2 border-t border-stone-200 bg-stone-50/80 px-4 py-4 sm:px-5">
            <dl className="space-y-1.5 text-sm">
              {viewOrder.type !== OrderType.TAKEAWAY_PICKUP ? (
                <div className="flex justify-between text-stone-600">
                  <dt>{t("pos.order.subtotal")}</dt>
                  <dd className="font-medium text-stone-900">{formatTmt(viewOrder.subtotalTmt)}</dd>
                </div>
              ) : null}
              {viewOrder.type === OrderType.TABLE ? (
                <ServiceFeeRow
                  servicePct={servicePct}
                  serviceFeeTmt={viewOrder.serviceFeeTmt}
                  waived={viewOrder.serviceFeeWaived}
                  editable={orderIsOpen}
                  toggleDisabled={busy}
                  onToggle={() => void toggleServiceFeeWaived()}
                  t={t}
                />
              ) : null}
              {viewOrder.type === OrderType.TAKEAWAY_DELIVERY ? (
                <div className="flex justify-between text-stone-600">
                  <dt>{t("pos.order.deliveryLine", { fee: deliveryFee })}</dt>
                  <dd className="font-medium text-stone-900">{formatTmt(viewOrder.deliveryFeeTmt)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-base font-bold text-stone-900">
                <dt>{t("pos.order.total")}</dt>
                <dd>{formatTmt(viewOrder.totalTmt)}</dd>
              </div>
            </dl>
          </div>

          <div className="shrink-0 border-t border-stone-200 bg-white p-4 sm:p-5 sm:pt-4">
            {viewOrder.status === OrderStatus.OPEN ? (
              <div className="flex gap-2">
                {effectiveOrderId ? (
                  <button
                    type="button"
                    disabled={busy || viewOrder.lines.length === 0}
                    className={`${btnReceipt} flex-1`}
                    onClick={() => showReceipt()}
                  >
                    {t("pos.order.printReceiptFull")}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy || viewOrder.lines.length === 0}
                  className={`${btnPrimary} ${effectiveOrderId ? "flex-1" : "w-full"}`}
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
                  setPrintJob({
                    allLines: receiptLinesForFull(order.lines),
                    omittedLineIds: [],
                    editable: false,
                    totals: {
                      subtotalTmt: order.subtotalTmt,
                      serviceFeeTmt: order.serviceFeeTmt,
                      deliveryFeeTmt: order.deliveryFeeTmt,
                      totalTmt: order.totalTmt,
                      serviceFeeWaived: order.serviceFeeWaived,
                    },
                  });
                }}
              >
                {t("pos.order.printReceipt")}
              </button>
            )}
          </div>
        </aside>
      </div>

      {printJob && order?.id && receiptDisplayTotals ? (
        <ReceiptModal
          open
          onClose={closeReceiptModal}
          title={t("pos.order.printReceipt")}
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
              orderType={viewOrder.type}
              tableLabel={viewOrder.table?.label ?? null}
              timestamp={order.openedAt}
              allLines={printJob.allLines}
              omittedLineIds={printJob.omittedLineIds}
              totals={receiptDisplayTotals}
              orderTypeLabel={orderTypeLabel}
              servicePct={servicePct}
              deliveryFee={deliveryFee}
              onToggleLine={toggleLineOnReceipt}
              onToggleServiceFee={() => void toggleServiceFeeWaived()}
              t={t}
            />
          ) : (
            <OrderReceiptView
              venueName={venueName}
              orderId={order.id}
              orderType={viewOrder.type}
              tableLabel={viewOrder.table?.label ?? null}
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
      ) : null}
    </div>
  );
}
