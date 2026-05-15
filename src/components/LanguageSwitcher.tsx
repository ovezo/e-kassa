"use client";

import { useLocale, useTranslations } from "@/lib/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/dictionary";

type Variant = "stone" | "amber";

const segmentActive: Record<Variant, string> = {
  stone: "bg-stone-900 text-white shadow-sm",
  amber: "bg-amber-900 text-white shadow-sm",
};

const segmentIdle: Record<Variant, string> = {
  stone: "text-stone-600 hover:bg-stone-100",
  amber: "text-amber-950 hover:bg-amber-100/80",
};

export function LanguageSwitcher({ variant = "stone" }: { variant?: Variant }) {
  const { locale, setLocale } = useLocale();
  const t = useTranslations();

  function seg(l: Locale) {
    const active = locale === l;
    return `min-h-[40px] min-w-[44px] touch-manipulation rounded-lg px-3 py-2 text-sm font-semibold transition ${
      active ? segmentActive[variant] : segmentIdle[variant]
    }`;
  }

  return (
    <div
      className={`inline-flex rounded-xl border p-0.5 ${
        variant === "amber" ? "border-amber-200 bg-white/80" : "border-stone-200 bg-stone-50"
      }`}
      role="group"
      aria-label={t("lang.label")}
    >
      <button type="button" className={seg("en")} onClick={() => setLocale("en")}>
        {t("lang.en")}
      </button>
      <button type="button" className={seg("ru")} onClick={() => setLocale("ru")}>
        {t("lang.ru")}
      </button>
    </div>
  );
}
