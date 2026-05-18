"use client";

import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useState } from "react";
import { unikassaInvoke } from "@/lib/electron-api";
import { useTranslations } from "@/lib/i18n/LocaleProvider";
import { readSession } from "@/lib/session";

const btnPrimary =
  "min-h-[44px] touch-manipulation rounded-xl bg-stone-900 px-4 py-2 text-base font-medium text-white hover:bg-stone-800 disabled:opacity-50";
const input =
  "mt-1 w-full min-h-[48px] touch-manipulation rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-stone-400";

export default function AdminSettingsPage() {
  const t = useTranslations();
  const actorId = readSession()?.id;
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const cfg = await unikassaInvoke<Record<string, string>>("settings.getAll");
      setSettings(cfg);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.settings.errLoad"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSetting(key: string, value: string) {
    try {
      const res = await unikassaInvoke<{ ok: boolean }>("settings.set", {
        key,
        value,
        actorUserId: actorId,
      });
      if (!res.ok) setError(t("admin.settings.errSave"));
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.settings.errSave"));
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader title={t("admin.settings.title")} showBack={false} />

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">{error}</p>
      ) : null}

      {settings ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingField
              label={t("admin.settings.venueName")}
              initial={settings.venue_name ?? ""}
              onSave={(v) => void saveSetting("venue_name", v)}
              saveLabel={t("common.save")}
            />
            <SettingField
              label={t("admin.settings.venueAddress")}
              initial={settings.venue_address ?? ""}
              onSave={(v) => void saveSetting("venue_address", v)}
              saveLabel={t("common.save")}
            />
            <SettingField
              label={t("admin.settings.receiptFooter")}
              initial={settings.receipt_footer ?? "NOŞ BOLSUN !"}
              onSave={(v) => void saveSetting("receipt_footer", v)}
              saveLabel={t("common.save")}
            />
            <SettingField
              label={t("admin.settings.serviceFee")}
              initial={settings.service_fee_percent ?? "10"}
              onSave={(v) => void saveSetting("service_fee_percent", v)}
              saveLabel={t("common.save")}
            />
            <SettingField
              label={t("admin.settings.deliveryFee")}
              initial={settings.delivery_fee_tmt ?? "3"}
              onSave={(v) => void saveSetting("delivery_fee_tmt", v)}
              saveLabel={t("common.save")}
            />
          </div>
        </section>
      ) : (
        <p className="text-stone-500">{t("common.loading")}</p>
      )}
    </div>
  );
}

function SettingField({
  label,
  initial,
  onSave,
  saveLabel,
}: {
  label: string;
  initial: string;
  onSave: (v: string) => void;
  saveLabel: string;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    setValue(initial);
  }, [initial]);
  return (
    <div>
      <label className="text-sm font-medium text-stone-600">{label}</label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input
          className={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="button" className={btnPrimary} onClick={() => onSave(value)}>
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
