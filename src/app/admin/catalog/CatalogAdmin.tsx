"use client";

import { ProductImageFileInput } from "@/components/admin/ProductImageFileInput";
import { PageHeader } from "@/components/PageHeader";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode, type SVGProps } from "react";
import { ikassirInvoke } from "@/lib/electron-api";
import { formatTmt } from "@/lib/format-money";
import { productImageDisplayUrl } from "@/lib/product-image-url";
import { readSession } from "@/lib/session";

type Tab = "categories" | "products" | "tables";

const sortableRow =
  "flex min-h-[52px] touch-manipulation items-stretch gap-2 rounded-xl border border-stone-200 bg-white py-2 pl-2 pr-4 text-base shadow-sm active:bg-stone-50";
const btn =
  "min-h-[44px] min-w-[44px] touch-manipulation rounded-xl border border-stone-300 bg-white px-4 py-2 text-base text-stone-800 hover:bg-stone-50 disabled:opacity-50";
const btnPrimary =
  "min-h-[44px] touch-manipulation rounded-xl bg-stone-900 px-4 py-2 text-base font-medium text-white hover:bg-stone-800 disabled:opacity-50";
const input =
  "mt-1 w-full min-h-[48px] touch-manipulation rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-stone-400";
const tabBtn =
  "min-h-[48px] touch-manipulation rounded-xl px-5 py-3 text-base font-medium";

const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;

function uint8ToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(s);
}

async function readImageFileForUpload(
  file: File,
): Promise<
  | { ok: true; imageBase64: string; imageMimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" }
  | { ok: false; error: string }
> {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
  if (!allowed.includes(file.type as (typeof allowed)[number])) {
    return { ok: false, error: "Use JPEG, PNG, WebP, or GIF." };
  }
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
    return { ok: false, error: "Image too large (max 2 MB)." };
  }
  const buf = await file.arrayBuffer();
  if (buf.byteLength > MAX_PRODUCT_IMAGE_BYTES) {
    return { ok: false, error: "Image too large (max 2 MB)." };
  }
  const mime = file.type as (typeof allowed)[number];
  return { ok: true, imageBase64: uint8ToBase64(new Uint8Array(buf)), imageMimeType: mime };
}

type CategoryRow = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  _count: { products: number };
};

type ProductRow = {
  id: string;
  name: string;
  priceTmt: number;
  categoryId: string;
  active: boolean;
  sortOrder: number;
  imageUrl: string | null;
  category: { name: string };
};

type TableRow = {
  id: string;
  label: string;
  sortOrder: number;
  active: boolean;
  _count: { orders: number };
};

function DragHandleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-6 w-6"
      aria-hidden
      {...props}
    >
      <circle cx="7" cy="5" r="1.4" />
      <circle cx="13" cy="5" r="1.4" />
      <circle cx="7" cy="10" r="1.4" />
      <circle cx="13" cy="10" r="1.4" />
      <circle cx="7" cy="15" r="1.4" />
      <circle cx="13" cy="15" r="1.4" />
    </svg>
  );
}

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`${sortableRow} ${isDragging ? "z-20 border-amber-300 bg-amber-50 shadow-md" : ""}`}
    >
      <span
        className="inline-flex shrink-0 cursor-grab touch-none items-center justify-center self-center rounded-lg text-stone-400 active:bg-stone-200 active:text-stone-600"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <DragHandleIcon />
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">{children}</div>
    </li>
  );
}

type CategoryEditForm = { id: string; name: string; active: boolean };
type ProductEditForm = {
  id: string;
  name: string;
  priceTmt: number;
  categoryId: string;
  active: boolean;
  imageUrl: string | null;
  pendingImageBase64: string | null;
  pendingImageMime: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null;
  pendingFileName: string | null;
  clearImage: boolean;
};
type TableEditForm = { id: string; label: string; active: boolean };

function InactiveBadge() {
  return (
    <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600">
      Inactive
    </span>
  );
}

function EditActions({
  busy,
  onSave,
  onCancel,
}: {
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={btnPrimary} disabled={busy} onClick={onSave}>
        Save
      </button>
      <button type="button" className={btn} disabled={busy} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function ProductBlock({
  category,
  productList,
  busy,
  categories,
  editingProductId,
  editProduct,
  onStartEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onReorder,
  onDelete,
  onImageError,
}: {
  category: CategoryRow;
  productList: ProductRow[];
  busy: boolean;
  categories: CategoryRow[];
  editingProductId: string | null;
  editProduct: ProductEditForm | null;
  onStartEdit: (p: ProductRow) => void;
  onEditChange: (patch: Partial<ProductEditForm>) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onReorder: (categoryId: string, orderedIds: string[]) => Promise<void>;
  onDelete: (id: string) => void;
  onImageError: (message: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
  );

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = productList.findIndex((p) => p.id === active.id);
    const newIndex = productList.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const orderedIds = arrayMove(
      productList.map((p) => p.id),
      oldIndex,
      newIndex,
    );
    await onReorder(category.id, orderedIds);
  }

  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold text-stone-800">{category.name}</h3>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(ev) => void handleDragEnd(ev)}>
        <SortableContext items={productList.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {productList.map((p) => {
              const isEditing = editingProductId === p.id && editProduct != null;
              return (
                <SortableRow key={p.id} id={p.id}>
                  {isEditing ? (
                    <div className="flex w-full min-w-0 flex-col gap-3 py-1 sm:flex-row sm:flex-wrap sm:items-end">
                      <div className="min-w-[140px] flex-1">
                        <label className="text-sm font-medium text-stone-600">Name</label>
                        <input
                          className={input}
                          value={editProduct.name}
                          onChange={(e) => onEditChange({ name: e.target.value })}
                        />
                      </div>
                      <div className="w-full sm:w-28">
                        <label className="text-sm font-medium text-stone-600">Price (TMT)</label>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          className={input}
                          value={editProduct.priceTmt || ""}
                          onChange={(e) =>
                            onEditChange({ priceTmt: Number(e.target.value) || 0 })
                          }
                        />
                      </div>
                      <div className="min-w-[140px] flex-1">
                        <label className="text-sm font-medium text-stone-600">Category</label>
                        <select
                          className={input}
                          value={editProduct.categoryId}
                          onChange={(e) => onEditChange({ categoryId: e.target.value })}
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <label className="flex min-h-[48px] cursor-pointer items-center gap-2 self-end text-sm text-stone-700">
                        <input
                          type="checkbox"
                          className="h-5 w-5 rounded border-stone-300"
                          checked={editProduct.active}
                          onChange={(e) => onEditChange({ active: e.target.checked })}
                        />
                        Active in POS
                      </label>
                      <div className="w-full basis-full">
                        <label className="text-sm font-medium text-stone-600">Photo (optional)</label>
                        <div className="mt-1 flex flex-wrap items-center gap-3">
                          {editProduct.imageUrl &&
                          !editProduct.clearImage &&
                          !editProduct.pendingImageBase64 ? (
                            <img
                              src={productImageDisplayUrl(editProduct.imageUrl) ?? ""}
                              alt=""
                              className="h-16 w-16 rounded-lg border border-stone-200 object-cover"
                            />
                          ) : null}
                          {editProduct.pendingImageBase64 && editProduct.pendingImageMime ? (
                            <span className="text-sm text-amber-900">New image selected — save to apply.</span>
                          ) : null}
                          {editProduct.clearImage ? (
                            <span className="text-sm text-stone-500">Photo will be removed when you save.</span>
                          ) : null}
                          <ProductImageFileInput
                            disabled={busy}
                            selectedFileName={editProduct.pendingFileName}
                            onSelect={(f) => {
                              void readImageFileForUpload(f).then((r) => {
                                if (!r.ok) {
                                  onImageError(r.error);
                                  return;
                                }
                                onEditChange({
                                  pendingImageBase64: r.imageBase64,
                                  pendingImageMime: r.imageMimeType,
                                  pendingFileName: f.name,
                                  clearImage: false,
                                });
                              });
                            }}
                          />
                          {(editProduct.imageUrl || editProduct.pendingImageBase64) &&
                          !editProduct.clearImage ? (
                            <button
                              type="button"
                              className={btn}
                              disabled={busy}
                              onClick={() =>
                                onEditChange({
                                  clearImage: true,
                                  pendingImageBase64: null,
                                  pendingImageMime: null,
                                  pendingFileName: null,
                                })
                              }
                            >
                              Remove photo
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <EditActions busy={busy} onSave={onSaveEdit} onCancel={onCancelEdit} />
                    </div>
                  ) : (
                    <>
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {p.imageUrl ? (
                          <img
                            src={productImageDisplayUrl(p.imageUrl) ?? ""}
                            alt=""
                            className="hidden h-14 w-14 shrink-0 rounded-lg border border-stone-200 object-cover sm:block"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : null}
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="font-medium text-stone-900">
                            {p.name}
                            {!p.active ? <InactiveBadge /> : null}
                          </span>
                          <span className="text-sm text-stone-500">{formatTmt(p.priceTmt)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          className={btn}
                          disabled={busy}
                          onClick={() => onStartEdit(p)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={`${btn} border-red-200 text-red-800`}
                          disabled={busy}
                          onClick={() => onDelete(p.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </SortableRow>
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  );
}

export function CatalogAdmin() {
  const actorId = readSession()?.id;
  const [tab, setTab] = useState<Tab>("categories");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [catForm, setCatForm] = useState({ name: "" });

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [prodForm, setProdForm] = useState({
    name: "",
    priceTmt: 0,
    categoryId: "",
  });
  const [createProductImage, setCreateProductImage] = useState<{
    imageBase64: string;
    imageMimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
    fileName: string;
  } | null>(null);

  const [tables, setTables] = useState<TableRow[]>([]);
  const [tableForm, setTableForm] = useState({ label: "" });

  const [editCategory, setEditCategory] = useState<CategoryEditForm | null>(null);
  const [editProduct, setEditProduct] = useState<ProductEditForm | null>(null);
  const [editTable, setEditTable] = useState<TableEditForm | null>(null);

  function clearEdits() {
    setEditCategory(null);
    setEditProduct(null);
    setEditTable(null);
    setCreateProductImage(null);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
  );

  const productsByCategory = useMemo(() => {
    const m = new Map<string, ProductRow[]>();
    for (const p of products) {
      const list = m.get(p.categoryId) ?? [];
      list.push(p);
      m.set(p.categoryId, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    }
    return m;
  }, [products]);

  const loadCategories = useCallback(async () => {
    const list = await ikassirInvoke<CategoryRow[]>("categories.list");
    setCategories(list);
  }, []);

  const loadProducts = useCallback(async () => {
    const list = await ikassirInvoke<ProductRow[]>("products.list", {});
    setProducts(list);
  }, []);

  const loadTables = useCallback(async () => {
    const list = await ikassirInvoke<TableRow[]>("tables.list");
    setTables(list);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      if (tab === "categories") await loadCategories();
      if (tab === "products") {
        await loadCategories();
        await loadProducts();
      }
      if (tab === "tables") await loadTables();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [tab, loadCategories, loadProducts, loadTables]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function persistCategoryOrder(orderedIds: string[]) {
    const res = await ikassirInvoke<{ ok: boolean; error?: string }>("categories.reorder", {
      orderedIds,
      actorUserId: actorId,
    });
    if (!res.ok) throw new Error(res.error ?? "Reorder failed");
  }

  async function persistTableOrder(orderedIds: string[]) {
    const res = await ikassirInvoke<{ ok: boolean; error?: string }>("tables.reorder", {
      orderedIds,
      actorUserId: actorId,
    });
    if (!res.ok) throw new Error(res.error ?? "Reorder failed");
  }

  async function persistProductOrder(categoryId: string, orderedIds: string[]) {
    const res = await ikassirInvoke<{ ok: boolean; error?: string }>("products.reorder", {
      categoryId,
      orderedIds,
      actorUserId: actorId,
    });
    if (!res.ok) throw new Error(res.error ?? "Reorder failed");
  }

  async function onCategoriesDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(categories, oldIndex, newIndex);
    setCategories(next);
    setBusy(true);
    try {
      await persistCategoryOrder(next.map((c) => c.id));
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reorder failed");
      await loadCategories();
    } finally {
      setBusy(false);
    }
  }

  async function onTablesDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = tables.findIndex((t) => t.id === active.id);
    const newIndex = tables.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(tables, oldIndex, newIndex);
    setTables(next);
    setBusy(true);
    try {
      await persistTableOrder(next.map((t) => t.id));
      await loadTables();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reorder failed");
      await loadTables();
    } finally {
      setBusy(false);
    }
  }

  async function addCategory(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    try {
      const res = await ikassirInvoke<{ ok: boolean; error?: string }>("categories.create", {
        name: catForm.name,
        actorUserId: actorId,
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else {
        setCatForm({ name: "" });
        await loadCategories();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm("Delete this category?")) return;
    setBusy(true);
    try {
      const res = await ikassirInvoke<{ ok: boolean; error?: string }>("categories.delete", {
        id,
        actorUserId: actorId,
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else {
        if (editCategory?.id === id) setEditCategory(null);
        await loadCategories();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveCategoryEdit() {
    if (!editCategory?.name.trim()) {
      setError("Category name is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await ikassirInvoke<{ ok: boolean; error?: string }>("categories.update", {
        id: editCategory.id,
        name: editCategory.name.trim(),
        active: editCategory.active,
        actorUserId: actorId,
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else {
        setEditCategory(null);
        await loadCategories();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function addProduct(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    try {
      const res = await ikassirInvoke<{ ok: boolean; error?: string }>("products.create", {
        name: prodForm.name,
        priceTmt: prodForm.priceTmt,
        categoryId: prodForm.categoryId,
        actorUserId: actorId,
        ...(createProductImage ?? {}),
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else {
        setProdForm({ name: "", priceTmt: 0, categoryId: "" });
        setCreateProductImage(null);
        await loadProducts();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm("Delete product?")) return;
    setBusy(true);
    try {
      const res = await ikassirInvoke<{ ok: boolean; error?: string }>("products.delete", {
        id,
        actorUserId: actorId,
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else {
        if (editProduct?.id === id) setEditProduct(null);
        await loadProducts();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveProductEdit() {
    if (!editProduct?.name.trim()) {
      setError("Product name is required");
      return;
    }
    if (!editProduct.categoryId) {
      setError("Category is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await ikassirInvoke<{ ok: boolean; error?: string }>("products.update", {
        id: editProduct.id,
        name: editProduct.name.trim(),
        priceTmt: editProduct.priceTmt,
        categoryId: editProduct.categoryId,
        active: editProduct.active,
        actorUserId: actorId,
        ...(editProduct.pendingImageBase64 && editProduct.pendingImageMime
          ? {
              imageBase64: editProduct.pendingImageBase64,
              imageMimeType: editProduct.pendingImageMime,
            }
          : {}),
        ...(editProduct.clearImage ? { clearImage: true } : {}),
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else {
        setEditProduct(null);
        await loadProducts();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function addTable(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    try {
      const res = await ikassirInvoke<{ ok: boolean; error?: string }>("tables.create", {
        label: tableForm.label,
        actorUserId: actorId,
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else {
        setTableForm({ label: "" });
        await loadTables();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTable(id: string) {
    if (!confirm("Delete table?")) return;
    setBusy(true);
    try {
      const res = await ikassirInvoke<{ ok: boolean; error?: string }>("tables.delete", {
        id,
        actorUserId: actorId,
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else {
        if (editTable?.id === id) setEditTable(null);
        await loadTables();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveTableEdit() {
    if (!editTable?.label.trim()) {
      setError("Table label is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await ikassirInvoke<{ ok: boolean; error?: string }>("tables.update", {
        id: editTable.id,
        label: editTable.label.trim(),
        active: editTable.active,
        actorUserId: actorId,
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else {
        setEditTable(null);
        await loadTables();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "categories", label: "Categories" },
    { id: "products", label: "Products" },
    { id: "tables", label: "Tables" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalog"
        subtitle="Categories, products (add-ons as separate products), and tables. Use the grip on the left to drag and sort — on touchscreens, hold the grip briefly before moving."
        backHref="/admin/dashboard"
      />

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={
              tab === t.id
                ? `${tabBtn} bg-amber-100 text-amber-950`
                : `${tabBtn} text-stone-600 hover:bg-stone-100`
            }
            onClick={() => {
              setTab(t.id);
              setError(null);
              clearEdits();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "categories" ? (
        <div className="space-y-6">
          <form className="flex flex-wrap items-end gap-3" onSubmit={addCategory}>
            <div className="min-w-[200px] flex-1">
              <label className="text-sm font-medium text-stone-600">Name</label>
              <input
                className={input}
                value={catForm.name}
                onChange={(e) => setCatForm((c) => ({ ...c, name: e.target.value }))}
                required
              />
            </div>
            <button type="submit" className={btnPrimary} disabled={busy}>
              Add category
            </button>
          </form>
          <p className="text-sm text-stone-500">New categories are added at the end. Drag to change order.</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onCategoriesDragEnd(e)}>
            <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {categories.map((c) => {
                  const isEditing = editCategory?.id === c.id;
                  return (
                  <SortableRow key={c.id} id={c.id}>
                    {isEditing && editCategory ? (
                      <div className="flex w-full min-w-0 flex-col gap-3 py-1 sm:flex-row sm:flex-wrap sm:items-end">
                        <div className="min-w-[200px] flex-1">
                          <label className="text-sm font-medium text-stone-600">Name</label>
                          <input
                            className={input}
                            value={editCategory.name}
                            onChange={(e) =>
                              setEditCategory((x) => (x ? { ...x, name: e.target.value } : x))
                            }
                          />
                        </div>
                        <label className="flex min-h-[48px] cursor-pointer items-center gap-2 self-end text-sm text-stone-700">
                          <input
                            type="checkbox"
                            className="h-5 w-5 rounded border-stone-300"
                            checked={editCategory.active}
                            onChange={(e) =>
                              setEditCategory((x) => (x ? { ...x, active: e.target.checked } : x))
                            }
                          />
                          Active in POS
                        </label>
                        <EditActions
                          busy={busy}
                          onSave={() => void saveCategoryEdit()}
                          onCancel={() => setEditCategory(null)}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="font-medium text-stone-900">
                            {c.name}
                            {!c.active ? <InactiveBadge /> : null}
                          </span>
                          <span className="text-sm text-stone-500">{c._count.products} products</span>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            className={btn}
                            disabled={busy}
                            onClick={() =>
                              setEditCategory({ id: c.id, name: c.name, active: c.active })
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`${btn} border-red-200 text-red-800`}
                            disabled={busy}
                            onClick={() => void deleteCategory(c.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </SortableRow>
                );
                })}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      ) : null}

      {tab === "products" ? (
        <div className="space-y-8">
          <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={addProduct}>
            <div>
              <label className="text-sm font-medium text-stone-600">Name</label>
              <input
                className={input}
                value={prodForm.name}
                onChange={(e) => setProdForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-stone-600">Price (TMT)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                className={input}
                value={prodForm.priceTmt || ""}
                onChange={(e) =>
                  setProdForm((p) => ({
                    ...p,
                    priceTmt: Number(e.target.value) || 0,
                  }))
                }
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-stone-600">Category</label>
              <select
                className={input}
                value={prodForm.categoryId}
                onChange={(e) => setProdForm((p) => ({ ...p, categoryId: e.target.value }))}
                required
              >
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" className={btnPrimary} disabled={busy}>
                Add product
              </button>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="text-sm font-medium text-stone-600">
                Photo (optional) 
                {
                  createProductImage 
                  ? (
                    <span className="ml-2 text-sm text-amber-900">Image selected — will upload when you add the product.</span>
                  )
                  : null
                }
              </label>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <ProductImageFileInput
                  disabled={busy}
                  selectedFileName={createProductImage?.fileName ?? null}
                  onSelect={(f) => {
                    void readImageFileForUpload(f).then((r) => {
                      if (!r.ok) {
                        setError(r.error);
                        return;
                      }
                      setCreateProductImage({
                        imageBase64: r.imageBase64,
                        imageMimeType: r.imageMimeType,
                        fileName: f.name,
                      });
                    });
                  }}
                />
                {createProductImage ? (
                  <button
                    type="button"
                    className={btn}
                    disabled={busy}
                    onClick={() => setCreateProductImage(null)}
                  >
                    Clear photo
                  </button>
                ) : null}
              </div>
            </div>
          </form>
          <p className="text-sm text-stone-500">
            New products are added at the end of their category. Drag by the grip to reorder within the category.
          </p>
          <div className="space-y-8">
            {categories.every((c) => (productsByCategory.get(c.id)?.length ?? 0) === 0) ? (
              <p className="text-base text-stone-500">No products yet — add one with the form above.</p>
            ) : null}
            {categories.map((cat) => {
              const plist = productsByCategory.get(cat.id) ?? [];
              if (plist.length === 0) return null;
              return (
                <ProductBlock
                  key={cat.id}
                  category={cat}
                  productList={plist}
                  busy={busy}
                  categories={categories}
                  editingProductId={editProduct?.id ?? null}
                  editProduct={editProduct}
                  onStartEdit={(p) =>
                    setEditProduct({
                      id: p.id,
                      name: p.name,
                      priceTmt: p.priceTmt,
                      categoryId: p.categoryId,
                      active: p.active,
                      imageUrl: p.imageUrl ?? null,
                      pendingImageBase64: null,
                      pendingImageMime: null,
                      pendingFileName: null,
                      clearImage: false,
                    })
                  }
                  onEditChange={(patch) =>
                    setEditProduct((x) => (x ? { ...x, ...patch } : x))
                  }
                  onSaveEdit={() => void saveProductEdit()}
                  onCancelEdit={() => setEditProduct(null)}
                  onReorder={async (categoryId, orderedIds) => {
                    setBusy(true);
                    try {
                      await persistProductOrder(categoryId, orderedIds);
                      await loadProducts();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Reorder failed");
                      await loadProducts();
                    } finally {
                      setBusy(false);
                    }
                  }}
                  onDelete={(id) => void deleteProduct(id)}
                  onImageError={(message) => setError(message)}
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {tab === "tables" ? (
        <div className="space-y-6">
          <form className="flex flex-wrap items-end gap-3" onSubmit={addTable}>
            <div className="min-w-[200px] flex-1">
              <label className="text-sm font-medium text-stone-600">Table label</label>
              <input
                className={input}
                value={tableForm.label}
                onChange={(e) => setTableForm((t) => ({ ...t, label: e.target.value }))}
                required
              />
            </div>
            <button type="submit" className={btnPrimary} disabled={busy}>
              Add table
            </button>
          </form>
          <p className="text-sm text-stone-500">New tables are added at the end. Drag to change order.</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onTablesDragEnd(e)}>
            <SortableContext items={tables.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {tables.map((t) => {
                  const isEditing = editTable?.id === t.id;
                  return (
                  <SortableRow key={t.id} id={t.id}>
                    {isEditing && editTable ? (
                      <div className="flex w-full min-w-0 flex-col gap-3 py-1 sm:flex-row sm:flex-wrap sm:items-end">
                        <div className="min-w-[200px] flex-1">
                          <label className="text-sm font-medium text-stone-600">Table label</label>
                          <input
                            className={input}
                            value={editTable.label}
                            onChange={(e) =>
                              setEditTable((x) => (x ? { ...x, label: e.target.value } : x))
                            }
                          />
                        </div>
                        <label className="flex min-h-[48px] cursor-pointer items-center gap-2 self-end text-sm text-stone-700">
                          <input
                            type="checkbox"
                            className="h-5 w-5 rounded border-stone-300"
                            checked={editTable.active}
                            onChange={(e) =>
                              setEditTable((x) => (x ? { ...x, active: e.target.checked } : x))
                            }
                          />
                          Active in POS
                        </label>
                        <EditActions
                          busy={busy}
                          onSave={() => void saveTableEdit()}
                          onCancel={() => setEditTable(null)}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="font-medium text-stone-900">
                            {t.label}
                            {!t.active ? <InactiveBadge /> : null}
                          </span>
                          <span className="text-sm text-stone-500">open orders: {t._count.orders}</span>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            className={btn}
                            disabled={busy}
                            onClick={() =>
                              setEditTable({ id: t.id, label: t.label, active: t.active })
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`${btn} border-red-200 text-red-800`}
                            disabled={busy}
                            onClick={() => void deleteTable(t.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </SortableRow>
                );
                })}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      ) : null}
    </div>
  );
}
