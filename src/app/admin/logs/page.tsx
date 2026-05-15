"use client";

import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useRef, useState } from "react";
import { ikassirInvoke } from "@/lib/electron-api";

type LogRow = {
  id: string;
  action: string;
  entity: string | null;
  payload: string | null;
  createdAt: string;
  user: { displayName: string; login: string } | null;
};

type LogsPage = {
  items: LogRow[];
  nextCursor: { createdAt: string; id: string } | null;
};

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [nextCursor, setNextCursor] = useState<{ createdAt: string; id: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadFirst = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const page = await ikassirInvoke<LogsPage>("logs.list", { limit: 200 });
      setLogs(page.items);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const page = await ikassirInvoke<LogsPage>("logs.list", {
        limit: 200,
        cursor: nextCursor,
      });
      setLogs((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoading(false);
    }
  }, [nextCursor, loading]);

  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        void loadMoreRef.current();
      },
      { root: null, rootMargin: "200px", threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [logs.length]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        subtitle="Newest first. Scroll down to load older entries (200 per batch)."
        backHref="/admin/dashboard"
      />
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">{error}</p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm touch-pan-x">
        <table className="w-full min-w-[720px] text-left text-base">
          <thead className="border-b border-stone-200 bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Payload</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((row) => (
              <tr key={row.id} className="border-b border-stone-100 align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-stone-600">
                  {new Date(row.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-stone-800">
                  {row.user ? row.user.displayName : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-sm text-stone-800">{row.action}</td>
                <td className="px-4 py-3 text-stone-600">{row.entity ?? "—"}</td>
                <td className="max-w-xs truncate px-4 py-3 font-mono text-sm text-stone-500">
                  {row.payload ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div ref={sentinelRef} className="flex min-h-12 items-center justify-center text-sm text-stone-500">
        {loading ? "Loading…" : nextCursor ? "Scroll for more" : logs.length ? "End of log" : null}
      </div>
    </div>
  );
}
