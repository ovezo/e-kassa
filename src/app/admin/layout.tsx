"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readSession, type SessionUser } from "@/lib/session";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const t = useTranslations();

  useEffect(() => {
    const s = readSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    if (s.role !== "ADMIN") {
      router.replace("/pos/open");
      return;
    }
    setUser(s);
  }, [router]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-stone-500">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-amber-100 bg-amber-50 px-4 py-3">
        <span className="text-lg font-semibold text-amber-950">{t("admin.brand")}</span>
        <nav className="flex flex-wrap gap-2 text-base">
          <Link
            className="min-h-[44px] touch-manipulation rounded-xl px-4 py-2.5 hover:bg-amber-100"
            href="/admin/dashboard"
          >
            {t("admin.nav.dashboard")}
          </Link>
          <Link
            className="min-h-[44px] touch-manipulation rounded-xl px-4 py-2.5 hover:bg-amber-100"
            href="/admin/users"
          >
            {t("admin.nav.users")}
          </Link>
          <Link
            className="min-h-[44px] touch-manipulation rounded-xl px-4 py-2.5 hover:bg-amber-100"
            href="/admin/logs"
          >
            {t("admin.nav.logs")}
          </Link>
          <Link
            className="min-h-[44px] touch-manipulation rounded-xl px-4 py-2.5 hover:bg-amber-100"
            href="/admin/catalog"
          >
            {t("admin.nav.catalog")}
          </Link>
          <Link
            className="min-h-[44px] touch-manipulation rounded-xl px-4 py-2.5 hover:bg-amber-100"
            href="/admin/reports"
          >
            {t("admin.nav.reports")}
          </Link>
        </nav>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <LanguageSwitcher variant="amber" />
          <Link
            href="/pos/open"
            className="min-h-[44px] touch-manipulation rounded-xl px-4 py-2.5 text-base font-medium text-amber-900 underline"
          >
            {t("admin.backPos")}
          </Link>
        </div>
      </header>
      <main className="flex-1 bg-stone-50 p-4">{children}</main>
    </div>
  );
}
