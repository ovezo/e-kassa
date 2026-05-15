"use client";

import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

const cardClass =
  "flex min-h-[160px] touch-manipulation flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm transition active:scale-[0.99] hover:border-stone-300";

export default function PosHomePage() {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("pos.home.title")} subtitle={t("pos.home.subtitle")} showBack={false} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/pos/create" className={cardClass}>
          <div className="text-xl font-semibold text-stone-800">{t("pos.home.createOrder")}</div>
          <div className="mt-2 text-base text-stone-500">{t("pos.home.createOrderHint")}</div>
        </Link>
        <Link href="/pos/open" className={cardClass}>
          <div className="text-xl font-semibold text-stone-800">{t("pos.home.openOrders")}</div>
          <div className="mt-2 text-base text-stone-500">{t("pos.home.openOrdersHint")}</div>
        </Link>
        <Link href="/pos/history" className={cardClass}>
          <div className="text-xl font-semibold text-stone-800">{t("pos.home.today")}</div>
          <div className="mt-2 text-base text-stone-500">{t("pos.home.todayHint")}</div>
        </Link>
      </div>
    </div>
  );
}
