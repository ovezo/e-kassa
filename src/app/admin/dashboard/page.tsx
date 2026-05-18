"use client";

import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useState } from "react";
import { unikassaInvoke } from "@/lib/electron-api";
import { formatTmt } from "@/lib/format-money";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

export default function AdminDashboardPage() {
  const t = useTranslations();
  const [stats, setStats] = useState<{
    closedOrdersToday: number;
    revenueTmtToday: number;
    openOrders: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const s = await unikassaInvoke<{
        closedOrdersToday: number;
        revenueTmtToday: number;
        openOrders: number;
      }>("stats.today");
      setStats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.dashboard.errLoad"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <PageHeader title={t("admin.dashboard.title")} showBack={false} />

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">{error}</p>
      ) : null}

      {stats ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              {t("admin.dashboard.closedToday")}
            </div>
            <div className="mt-2 text-3xl font-semibold text-stone-900">{stats.closedOrdersToday}</div>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              {t("admin.dashboard.revenueToday")}
            </div>
            <div className="mt-2 text-3xl font-semibold text-stone-900">
              {formatTmt(stats.revenueTmtToday)}
            </div>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              {t("admin.dashboard.openOrders")}
            </div>
            <div className="mt-2 text-3xl font-semibold text-stone-900">{stats.openOrders}</div>
          </div>
        </div>
      ) : (
        <p className="text-stone-500">{t("common.loading")}</p>
      )}
    </div>
  );
}
