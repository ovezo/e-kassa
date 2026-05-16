"use client";

import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useState } from "react";
import { ikassirInvoke } from "@/lib/electron-api";
import { formatTmt } from "@/lib/format-money";
import { readSession } from "@/lib/session";

const btnPrimary =
  "min-h-[44px] touch-manipulation rounded-xl bg-stone-900 px-4 py-2 text-base font-medium text-white hover:bg-stone-800 disabled:opacity-50";
const input =
  "mt-1 w-full min-h-[48px] touch-manipulation rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-stone-400";

export default function AdminDashboardPage() {
  const actorId = readSession()?.id;
  const [stats, setStats] = useState<{
    closedOrdersToday: number;
    revenueTmtToday: number;
    openOrders: number;
  } | null>(null);
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, cfg] = await Promise.all([
        ikassirInvoke<{
          closedOrdersToday: number;
          revenueTmtToday: number;
          openOrders: number;
        }>("stats.today"),
        ikassirInvoke<Record<string, string>>("settings.getAll"),
      ]);
      setStats(s);
      setSettings(cfg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSetting(key: string, value: string) {
    try {
      const res = await ikassirInvoke<{ ok: boolean }>("settings.set", {
        key,
        value,
        actorUserId: actorId,
      });
      if (!res.ok) setError("Save failed");
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle="Today's snapshot and quick settings. Amounts are in TMT."
        showBack={false}
      />

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">{error}</p>
      ) : null}

      {stats ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Closed today</div>
            <div className="mt-2 text-3xl font-semibold text-stone-900">{stats.closedOrdersToday}</div>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Revenue today</div>
            <div className="mt-2 text-3xl font-semibold text-stone-900">
              {formatTmt(stats.revenueTmtToday)}
            </div>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Open orders</div>
            <div className="mt-2 text-3xl font-semibold text-stone-900">{stats.openOrders}</div>
          </div>
        </div>
      ) : (
        <p className="text-stone-500">Loading…</p>
      )}

      {settings ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-stone-800">Quick settings</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <QuickSetting
              label="Venue name (on receipt)"
              initial={settings.venue_name ?? ""}
              onSave={(v) => void saveSetting("venue_name", v)}
            />
            <QuickSetting
              label="Venue address (on receipt)"
              initial={settings.venue_address ?? ""}
              onSave={(v) => void saveSetting("venue_address", v)}
            />
            <QuickSetting
              label="Receipt footer message"
              initial={settings.receipt_footer ?? "NOŞ BOLSUN !"}
              onSave={(v) => void saveSetting("receipt_footer", v)}
            />
            <QuickSetting
              label="Service fee % (table orders)"
              initial={settings.service_fee_percent ?? "10"}
              onSave={(v) => void saveSetting("service_fee_percent", v)}
            />
            <QuickSetting
              label="Delivery fee (TMT)"
              initial={settings.delivery_fee_tmt ?? "3"}
              onSave={(v) => void saveSetting("delivery_fee_tmt", v)}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function QuickSetting({
  label,
  initial,
  onSave,
}: {
  label: string;
  initial: string;
  onSave: (v: string) => void;
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
          Save
        </button>
      </div>
    </div>
  );
}
