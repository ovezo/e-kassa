"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useState } from "react";
import { OrderType } from "@prisma/client";
import { unikassaInvoke } from "@/lib/electron-api";
import { readSession } from "@/lib/session";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

const cardClass =
  "flex min-h-[120px] touch-manipulation flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm transition active:scale-[0.99] hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-60";

const occupiedCardClass =
  "flex min-h-[120px] cursor-not-allowed flex-col items-center justify-center rounded-2xl border border-stone-200 bg-gray-100 p-6 text-center";

type TableRow = {
  id: string;
  label: string;
  sortOrder: number;
  active: boolean;
  _count: { orders: number };
};

export default function PosCreateTablePage() {
  const router = useRouter();
  const t = useTranslations();
  const [tables, setTables] = useState<TableRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyTableId, setBusyTableId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await unikassaInvoke<TableRow[]>("tables.list");
      setTables(list.filter((row) => row.active));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tables");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function goToOrder(tableId: string) {
    const session = readSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    setBusyTableId(tableId);
    setError(null);
    try {
      const params = new URLSearchParams({
        type: OrderType.TABLE,
        tableId,
      });
      router.push(`/pos/order?${params.toString()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyTableId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("pos.table.title")} backHref="/pos/create" />
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">{error}</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {tables.map((tbl) => {
          const hasOpenOrder = tbl._count.orders > 0;
          return (
            <button
              key={tbl.id}
              type="button"
              className={hasOpenOrder ? occupiedCardClass : cardClass}
              disabled={hasOpenOrder || busyTableId !== null}
              aria-disabled={hasOpenOrder}
              onClick={() => void goToOrder(tbl.id)}
            >
              <span
                className={`text-xl font-semibold ${hasOpenOrder ? "text-stone-700" : "text-stone-900"}`}
              >
                {tbl.label}
              </span>
              {hasOpenOrder ? (
                <>
                  <span className="mt-2 text-sm font-medium text-stone-600">
                    {tbl._count.orders} {t("pos.table.openTabs")}
                  </span>
                  <span className="mt-1 text-xs text-stone-500">
                    {t("pos.table.occupiedHint")}
                  </span>
                </>
              ) : (
                <span className="mt-2 text-sm text-stone-500">{t("pos.table.available")}</span>
              )}
            </button>
          );
        })}
      </div>
      {tables.length === 0 && !error ? (
        <p className="text-stone-500">{t("pos.table.noTables")}</p>
      ) : null}
    </div>
  );
}
