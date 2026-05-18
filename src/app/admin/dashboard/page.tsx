"use client";

import { TopProductsChart } from "@/components/admin/TopProductsChart";
import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useState } from "react";
import { unikassaInvoke } from "@/lib/electron-api";
import { formatTmt } from "@/lib/format-money";
import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";
import type { ProductChartRow } from "@/lib/product-sales";

type Period = "day" | "week" | "month";

type OrderTypeMetric = {
  count: number;
  revenueTmt: number;
};

type Breakdown = {
  total: OrderTypeMetric;
  dineIn: OrderTypeMetric;
  pickup: OrderTypeMetric;
  delivery: OrderTypeMetric;
  rangeStart: string;
  rangeEnd: string;
};

type CompareStats = {
  period: Period;
  current: Breakdown;
  previous: Breakdown;
  productChart: ProductChartRow[];
};

const tabBtn =
  "min-h-[48px] touch-manipulation rounded-xl px-5 py-3 text-base font-medium";

const cardCurrent =
  "rounded-2xl border border-amber-200/80 bg-amber-50 p-6 shadow-sm";
const cardPrevious =
  "rounded-2xl border border-sky-200/80 bg-sky-50 p-6 shadow-sm";

function formatUntilTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUntilDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetricValue({
  metric,
  prominent = false,
}: {
  metric: OrderTypeMetric;
  prominent?: boolean;
}) {
  return (
    <span className="text-right tabular-nums">
      <span
        className={
          prominent
            ? "text-2xl font-semibold text-stone-900"
            : "font-medium text-stone-900"
        }
      >
        {metric.count}
      </span>
      <span className={prominent ? "ml-3 text-lg text-stone-600" : "ml-2 text-stone-500"}>
        {formatTmt(metric.revenueTmt)}
      </span>
    </span>
  );
}

function PeriodBreakdownCard({
  title,
  breakdown,
  t,
  className,
}: {
  title: string;
  breakdown: Breakdown;
  t: (key: string, vars?: Record<string, string>) => string;
  className: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</p>
      <div className="mt-2">
        <MetricValue metric={breakdown.total} prominent />
      </div>
      <dl className="mt-4 space-y-2 text-sm text-stone-700">
        <div className="flex justify-between gap-4">
          <dt>{t("pos.order.type.table")}</dt>
          <dd>
            <MetricValue metric={breakdown.dineIn} />
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{t("pos.order.type.pickup")}</dt>
          <dd>
            <MetricValue metric={breakdown.pickup} />
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{t("pos.order.type.delivery")}</dt>
          <dd>
            <MetricValue metric={breakdown.delivery} />
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function AdminDashboardPage() {
  const t = useTranslations();
  const { locale } = useLocale();
  const loc = locale === "ru" ? "ru-RU" : "en-US";
  const [period, setPeriod] = useState<Period>("day");
  const [stats, setStats] = useState<CompareStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setStats(null);
    try {
      const s = await unikassaInvoke<CompareStats>("stats.compare", { period });
      setStats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.dashboard.errLoad"));
    }
  }, [period, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const periods: { id: Period; label: string }[] = [
    { id: "day", label: t("admin.dashboard.period.day") },
    { id: "week", label: t("admin.dashboard.period.week") },
    { id: "month", label: t("admin.dashboard.period.month") },
  ];

  function currentTitle(): string {
    switch (period) {
      case "day":
        return t("admin.dashboard.current.day");
      case "week":
        return t("admin.dashboard.current.week");
      case "month":
        return t("admin.dashboard.current.month");
    }
  }

  function previousTitle(untilIso: string): string {
    switch (period) {
      case "day":
        return t("admin.dashboard.previous.day", {
          time: formatUntilTime(untilIso, loc),
        });
      case "week":
      case "month":
        return t(`admin.dashboard.previous.${period}`, {
          datetime: formatUntilDateTime(untilIso, loc),
        });
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader title={t("admin.dashboard.title")} showBack={false} />

      <div className="flex flex-wrap gap-2">
        {periods.map((p) => (
          <button
            key={p.id}
            type="button"
            className={
              period === p.id
                ? `${tabBtn} bg-amber-100 text-amber-950`
                : `${tabBtn} text-stone-600 hover:bg-stone-100`
            }
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">{error}</p>
      ) : null}

      {stats ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <PeriodBreakdownCard
              title={currentTitle()}
              breakdown={stats.current}
              t={t}
              className={cardCurrent}
            />
            <PeriodBreakdownCard
              title={previousTitle(stats.previous.rangeEnd)}
              breakdown={stats.previous}
              t={t}
              className={cardPrevious}
            />
          </div>

          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
              {t("admin.dashboard.chartTitle")}
            </h2>
            <div className="mt-4">
              <TopProductsChart
                rows={stats.productChart}
                currentLabel={currentTitle()}
                previousLabel={previousTitle(stats.previous.rangeEnd)}
              />
            </div>
          </section>
        </div>
      ) : (
        <p className="text-stone-500">{t("common.loading")}</p>
      )}
    </div>
  );
}
