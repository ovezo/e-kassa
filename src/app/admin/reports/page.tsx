"use client";

import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useState } from "react";
import { unikassaInvoke } from "@/lib/electron-api";

const btnPrimary =
  "min-h-[44px] touch-manipulation rounded-xl bg-stone-900 px-4 py-2 text-base font-medium text-white hover:bg-stone-800 disabled:opacity-50";
const input =
  "mt-1 w-full min-h-[48px] touch-manipulation rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-stone-400";

type LogRow = {
  id: string;
  action: string;
  entity: string | null;
  payload: string | null;
  createdAt: string;
  user: { displayName: string } | null;
};

type LogsPage = {
  items: LogRow[];
  nextCursor: { createdAt: string; id: string } | null;
};

async function fetchAllAuditLogs(): Promise<LogRow[]> {
  const out: LogRow[] = [];
  let cursor: { createdAt: string; id: string } | undefined;
  for (;;) {
    const page = await unikassaInvoke<LogsPage>("logs.list", {
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    out.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
    if (out.length > 50_000) break;
  }
  return out;
}

export default function AdminReportsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchAllAuditLogs();
      setLogs(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function downloadCsv() {
    const header = ["createdAt", "user", "action", "entity", "payload"];
    const rows = logs.map((r) => [
      r.createdAt,
      r.user?.displayName ?? "",
      r.action,
      r.entity ?? "",
      (r.payload ?? "").replaceAll('"', '""'),
    ]);
    const csv = [header.join(","), ...rows.map((c) => c.map((x) => `"${x}"`).join(","))].join(
      "\n",
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unikassa-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        backHref="/admin/dashboard"
        actions={
          <button type="button" className={btnPrimary} onClick={downloadCsv} disabled={loading || !logs.length}>
            Download audit CSV
          </button>
        }
      />
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">{error}</p>
      ) : null}
      <div>
        <label className="text-sm font-medium text-stone-600">Preview (first 10 rows)</label>
        <textarea
          className={`${input} mt-1 font-mono text-sm`}
          readOnly
          rows={12}
          value={
            loading
              ? "Loading audit log…"
              : logs
                  .slice(0, 10)
                  .map((r) => `${r.createdAt}\t${r.user?.displayName ?? ""}\t${r.action}`)
                  .join("\n")
          }
        />
      </div>
    </div>
  );
}
