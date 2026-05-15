"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { OrderType } from "@prisma/client";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

const cardClass =
  "flex min-h-[160px] w-full touch-manipulation flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm transition active:scale-[0.99] hover:border-amber-300 disabled:opacity-50";

export default function PosCreateTakeawayPage() {
  const router = useRouter();
  const t = useTranslations();

  function goToOrder(type: OrderType) {
    router.push(`/pos/order?type=${encodeURIComponent(type)}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pos.takeaway.title")}
        subtitle={t("pos.takeaway.subtitle")}
        backHref="/pos/create"
      />
      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          className={cardClass}
          onClick={() => goToOrder(OrderType.TAKEAWAY_PICKUP)}
        >
          <span className="text-xl font-semibold text-stone-900">{t("pos.takeaway.pickup")}</span>
          <span className="mt-2 text-base text-stone-500">{t("pos.takeaway.pickupHint")}</span>
        </button>
        <button
          type="button"
          className={cardClass}
          onClick={() => goToOrder(OrderType.TAKEAWAY_DELIVERY)}
        >
          <span className="text-xl font-semibold text-stone-900">{t("pos.takeaway.delivery")}</span>
          <span className="mt-2 text-base text-stone-500">{t("pos.takeaway.deliveryHint")}</span>
        </button>
      </div>
    </div>
  );
}
