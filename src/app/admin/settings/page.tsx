"use client";

import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useRef, useState } from "react";
import { unikassaInvoke } from "@/lib/electron-api";
import { readImageFileForUpload } from "@/lib/image-file-upload";
import { useTranslations } from "@/lib/i18n/LocaleProvider";
import { readSession } from "@/lib/session";

const btnPrimary =
  "min-h-[44px] touch-manipulation rounded-xl bg-stone-900 px-4 py-2 text-base font-medium text-white hover:bg-stone-800 disabled:opacity-50";
const btnSecondary =
  "min-h-[44px] touch-manipulation rounded-xl border border-stone-300 bg-white px-4 py-2 text-base font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50";
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
            <ReceiptLogoSettings
              widthPercent={settings.receipt_logo_width_percent ?? "60"}
              onSaveWidth={(v) => void saveSetting("receipt_logo_width_percent", v)}
              onError={setError}
              onReload={load}
              actorUserId={actorId}
              t={t}
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

function ReceiptLogoSettings({
  widthPercent,
  onSaveWidth,
  onError,
  onReload,
  actorUserId,
  t,
  saveLabel,
}: {
  widthPercent: string;
  onSaveWidth: (v: string) => void;
  onError: (msg: string | null) => void;
  onReload: () => Promise<void>;
  actorUserId?: string;
  t: (key: string) => string;
  saveLabel: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [width, setWidth] = useState(widthPercent);
  const [busy, setBusy] = useState(false);

  const loadPreview = useCallback(async () => {
    try {
      const res = await unikassaInvoke<
        { ok: true; dataUrl: string } | { ok: false }
      >("settings.getReceiptLogo");
      setPreview(res.ok ? res.dataUrl : null);
    } catch {
      setPreview(null);
    }
  }, []);

  useEffect(() => {
    setWidth(widthPercent);
  }, [widthPercent]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  async function onPickFile(file: File) {
    onError(null);
    const parsed = await readImageFileForUpload(file);
    if (!parsed.ok) {
      onError(parsed.error);
      return;
    }
    setBusy(true);
    try {
      const res = await unikassaInvoke<{ ok: boolean; error?: string }>(
        "settings.uploadReceiptLogo",
        {
          imageBase64: parsed.imageBase64,
          imageMimeType: parsed.imageMimeType,
          actorUserId,
        },
      );
      if (!res.ok) {
        onError(res.error ?? t("admin.settings.errSave"));
        return;
      }
      await onReload();
      await loadPreview();
    } catch (e) {
      onError(e instanceof Error ? e.message : t("admin.settings.errSave"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onClear() {
    onError(null);
    setBusy(true);
    try {
      await unikassaInvoke("settings.clearReceiptLogo", { actorUserId });
      setPreview(null);
      await onReload();
    } catch (e) {
      onError(e instanceof Error ? e.message : t("admin.settings.errSave"));
    } finally {
      setBusy(false);
    }
  }

  function saveWidth() {
    const n = Number.parseInt(width.trim(), 10);
    if (!Number.isFinite(n) || n < 10 || n > 100) {
      onError(t("admin.settings.receiptLogoWidthInvalid"));
      return;
    }
    onSaveWidth(String(n));
  }

  return (
    <div className="sm:col-span-2 space-y-3 border-t border-stone-100 pt-4">
      <p className="text-sm font-medium text-stone-600">{t("admin.settings.receiptLogo")}</p>
      <p className="text-sm text-stone-500">{t("admin.settings.receiptLogoHint")}</p>

      {preview ? (
        <div className="flex justify-center rounded-xl border border-stone-200 bg-stone-50 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt=""
            className="max-h-32 w-auto object-contain"
            style={{ width: `${Math.min(100, Math.max(10, Number.parseInt(width, 10) || 60))}%` }}
          />
        </div>
      ) : (
        <p className="text-sm text-stone-400">{t("admin.settings.receiptLogoNone")}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPickFile(file);
          }}
        />
        <button
          type="button"
          className={btnPrimary}
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {preview ? t("admin.settings.receiptLogoReplace") : t("admin.settings.receiptLogoUpload")}
        </button>
        {preview ? (
          <button type="button" className={btnSecondary} disabled={busy} onClick={() => void onClear()}>
            {t("admin.settings.receiptLogoRemove")}
          </button>
        ) : null}
      </div>

      <div>
        <label className="text-sm font-medium text-stone-600">
          {t("admin.settings.receiptLogoWidth")}
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            className={`${input} max-w-[8rem]`}
            type="number"
            min={10}
            max={100}
            value={width}
            disabled={busy}
            onChange={(e) => setWidth(e.target.value)}
          />
          <span className="text-sm text-stone-500">%</span>
          <button type="button" className={btnPrimary} disabled={busy} onClick={saveWidth}>
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
