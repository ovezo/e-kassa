"use client";

import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { OrderType } from "@prisma/client";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

const cardClass =
  "flex min-h-[160px] touch-manipulation flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm transition active:scale-[0.99] hover:border-stone-300";

const iconWrap = "mb-3 flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-600";

function IconPickup({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}

function IconDelivery({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m8 0a2 2 0 104 0" />
    </svg>
  );
}

function IconDineIn({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 10h16M4 10v8h16v-8M4 10l2-6h12l2 6M9 18v2M15 18v2" />
    </svg>
  );
}

export default function PosCreatePage() {
  const t = useTranslations();
  return (
    <div className="flex min-h-[60vh] flex-col gap-6">
      <PageHeader title={t("pos.create.title")} subtitle={t("pos.create.subtitle")} backHref="/pos/open" />
      <div className="grid flex-1 gap-4 sm:grid-cols-3">
        <Link
          href={`/pos/order?type=${encodeURIComponent(OrderType.TAKEAWAY_PICKUP)}`}
          className={cardClass}
        >
          <span className={iconWrap}>
            <IconPickup className="h-8 w-8" />
          </span>
          <div className="text-xl font-semibold text-stone-800">{t("pos.create.pickup")}</div>
          <div className="mt-2 text-base text-stone-500">{t("pos.create.pickupHint")}</div>
        </Link>
        <Link
          href={`/pos/order?type=${encodeURIComponent(OrderType.TAKEAWAY_DELIVERY)}`}
          className={cardClass}
        >
          <span className={iconWrap}>
            <IconDelivery className="h-8 w-8" />
          </span>
          <div className="text-xl font-semibold text-stone-800">{t("pos.create.delivery")}</div>
          <div className="mt-2 text-base text-stone-500">{t("pos.create.deliveryHint")}</div>
        </Link>
        <Link href="/pos/create/table" className={cardClass}>
          <span className={iconWrap}>
            <IconDineIn className="h-8 w-8" />
          </span>
          <div className="text-xl font-semibold text-stone-800">{t("pos.create.dineIn")}</div>
          <div className="mt-2 text-base text-stone-500">{t("pos.create.dineInHint")}</div>
        </Link>
      </div>
    </div>
  );
}
