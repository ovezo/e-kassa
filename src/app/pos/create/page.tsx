"use client";

import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

const cardClass =
  "flex min-h-[160px] touch-manipulation flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm transition active:scale-[0.99] hover:border-stone-300";

export default function PosCreatePage() {
  const t = useTranslations();
  return (
    <div className="flex min-h-[60vh] flex-col gap-6">
      <PageHeader title={t("pos.create.title")} backHref="/pos" />
      <div className="grid flex-1 gap-4 md:grid-cols-2">
        <Link href="/pos/create/takeaway" className={cardClass}>
          <div className="text-xl font-semibold text-stone-800">{t("pos.create.takeaway")}</div>
          <div className="mt-2 text-base text-stone-500">{t("pos.create.takeawayHint")}</div>
        </Link>
        <Link href="/pos/create/table" className={cardClass}>
          <div className="text-xl font-semibold text-stone-800">{t("pos.create.table")}</div>
          <div className="mt-2 text-base text-stone-500">{t("pos.create.tableHint")}</div>
        </Link>
      </div>
      <p className="text-base text-stone-500">{t("pos.create.footer")}</p>
    </div>
  );
}
