"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useState } from "react";
import { OrderType } from "@prisma/client";
import { ikassirInvoke } from "@/lib/electron-api";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

const cardClass =
  "flex min-h-[120px] touch-manipulation flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm transition active:scale-[0.99] hover:border-stone-300 disabled:opacity-50";

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

  const load = useCallback(async () => {
    try {
      const list = await ikassirInvoke<TableRow[]>("tables.list");
      setTables(list.filter((row) => row.active));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tables");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function goToOrder(tableId: string) {
    router.push(`/pos/order?type=${OrderType.TABLE}&tableId=${encodeURIComponent(tableId)}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pos.table.title")}
        subtitle={t("pos.table.subtitle")}
        backHref="/pos/create"
      />
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">{error}</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {tables.map((tbl) => (
          <button
            key={tbl.id}
            type="button"
            className={cardClass}
            onClick={() => goToOrder(tbl.id)}
          >
            <span className="text-xl font-semibold text-stone-900">{tbl.label}</span>
            {tbl._count.orders > 0 ? (
              <span className="mt-2 text-sm text-amber-800">
                {tbl._count.orders} {t("pos.table.openTabs")}
              </span>
            ) : (
              <span className="mt-2 text-sm text-stone-500">{t("pos.table.available")}</span>
            )}
          </button>
        ))}
      </div>
      {tables.length === 0 && !error ? (
        <p className="text-stone-500">{t("pos.table.noTables")}</p>
      ) : null}
    </div>
  );
}
