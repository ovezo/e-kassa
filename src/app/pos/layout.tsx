"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSession, readSession, type SessionUser } from "@/lib/session";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslations } from "@/lib/i18n/LocaleProvider";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";

export default function PosLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const t = useTranslations();

  useEffect(() => {
    const s = readSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    setUser(s);
  }, [router]);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  if (!user) {
    return (
      <div className="flex h-dvh max-h-dvh items-center justify-center text-stone-500">
        {t("common.loading")}
      </div>
    );
  }

  const navLink = (href: string, label: string) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        href={href}
        className={`min-h-[44px] touch-manipulation rounded-xl px-4 py-2.5 text-base font-medium transition active:scale-[0.98] ${
          active ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-200"
        }`}
      >
        {label}
      </Link>
    );
  };

  /** Order screen manages its own scroll (menu / cart); other POS pages scroll this region. */
  const orderShell = pathname.startsWith("/pos/order");

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-stone-50 print:h-auto print:max-h-none print:min-h-0 print:overflow-visible">
      <header className="shrink-0 border-b border-stone-200 bg-white print:hidden">
        <div className="mx-auto flex w-full flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <nav className="flex flex-wrap items-center gap-1">
            {navLink("/pos/create", t("pos.nav.createOrder"))}
            {navLink("/pos/open", t("pos.nav.openOrders"))}
            {navLink("/pos/history", t("pos.nav.today"))}
            {user.role === "ADMIN" ? (
              <Link
                href="/admin/dashboard"
                className="min-h-[44px] touch-manipulation rounded-xl px-4 py-2.5 text-base font-medium text-amber-900 hover:bg-amber-100"
              >
                {t("pos.nav.admin")}
              </Link>
            ) : null}
          </nav>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowChangePassword(true)}
              className="text-sm text-stone-600 hover:text-stone-900 underline decoration-stone-300 underline-offset-4"
            >
              {user.displayName}
            </button>
            <LanguageSwitcher />
            <button
              type="button"
              onClick={logout}
              className="min-h-[44px] touch-manipulation rounded-xl border border-stone-300 px-4 py-2 text-base text-stone-700 hover:bg-stone-100"
            >
              {t("pos.nav.logout")}
            </button>
          </div>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden print:overflow-visible print:pt-0">
        <div
          className={`mx-auto flex min-h-0 w-full flex-1 flex-col px-4 py-3 sm:px-6 print:max-w-none print:px-4 print:py-2 ${
            orderShell
              ? "overflow-hidden"
              : "overflow-y-auto overscroll-y-contain"
          }`}
        >
          {children}
        </div>
      </main>

      {showChangePassword && user && (
        <ChangePasswordModal
          userId={user.id}
          actorId={user.id}
          userName={user.displayName}
          onClose={() => setShowChangePassword(false)}
          onSuccess={() => {
            setShowChangePassword(false);
            alert("Password changed successfully");
          }}
        />
      )}
    </div>
  );
}
