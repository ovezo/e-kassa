"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OrderType } from "@prisma/client";
import { PageHeader } from "@/components/PageHeader";
import { readSession } from "@/lib/session";
import {
  IconDelivery,
  IconDineIn,
  IconPickup,
  orderTypeIconWrapClass,
} from "@/components/pos/order-type-icons";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

const cardClass =
  "flex min-h-[160px] w-full touch-manipulation flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm transition active:scale-[0.99] hover:border-stone-300 disabled:opacity-50";

const iconWrap = `mb-3 h-14 w-14 ${orderTypeIconWrapClass}`;

export default function PosCreatePage() {
  const router = useRouter();
  const t = useTranslations();
  const [busy, setBusy] = useState<"pickup" | "delivery" | "table" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function begin(type: OrderType, tableId: string | null, busyKey: typeof busy) {
    const session = readSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    setError(null);
    setBusy(busyKey);
    try {
      const params = new URLSearchParams({ type });
      if (tableId) params.set("tableId", tableId);
      router.push(`/pos/order?${params.toString()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-[60vh] flex-col gap-6">
      <PageHeader title={t("pos.create.title")} backHref="/pos/open" />
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">{error}</p>
      ) : null}
      <div className="grid flex-1 gap-4 sm:grid-cols-3">
        <button
          type="button"
          className={cardClass}
          disabled={busy !== null}
          onClick={() => void begin(OrderType.TAKEAWAY_PICKUP, null, "pickup")}
        >
          <span className={iconWrap}>
            <IconPickup className="h-8 w-8" />
          </span>
          <div className="text-xl font-semibold text-stone-800">{t("pos.create.pickup")}</div>
          <div className="mt-2 text-base text-stone-500">{t("pos.create.pickupHint")}</div>
        </button>
        <button
          type="button"
          className={cardClass}
          disabled={busy !== null}
          onClick={() => void begin(OrderType.TAKEAWAY_DELIVERY, null, "delivery")}
        >
          <span className={iconWrap}>
            <IconDelivery className="h-8 w-8" />
          </span>
          <div className="text-xl font-semibold text-stone-800">{t("pos.create.delivery")}</div>
          <div className="mt-2 text-base text-stone-500">{t("pos.create.deliveryHint")}</div>
        </button>
        <button
          type="button"
          className={cardClass}
          disabled={busy !== null}
          onClick={() => router.push("/pos/create/table")}
        >
          <span className={iconWrap}>
            <IconDineIn className="h-8 w-8" />
          </span>
          <div className="text-xl font-semibold text-stone-800">{t("pos.create.dineIn")}</div>
          <div className="mt-2 text-base text-stone-500">{t("pos.create.dineInHint")}</div>
        </button>
      </div>
    </div>
  );
}
