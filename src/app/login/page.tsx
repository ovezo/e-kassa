"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ikassirInvoke } from "@/lib/electron-api";
import { readSession, saveSession, type SessionUser } from "@/lib/session";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

type Bootstrap = { needsSetup: boolean };

type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string };

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const redirectIfSession = useCallback(() => {
    if (readSession()) {
      router.replace("/pos/open");
    }
  }, [router]);

  useEffect(() => {
    redirectIfSession();
  }, [redirectIfSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const boot = await ikassirInvoke<Bootstrap>("auth/bootstrap");
        if (cancelled) return;
        if (boot.needsSetup) {
          router.replace("/setup");
        }
      } catch {
        setError(t("login.errDev"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, t]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await ikassirInvoke<LoginResult>("auth/login", {
        login,
        password,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      saveSession(res.user);
      router.replace("/pos/open");
    } catch {
      setError(t("login.errNetwork"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-stone-800">
          {t("login.title")}
        </h1>
        <p className="mt-1 text-center text-sm text-stone-500">{t("login.subtitle")}</p>
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-xs font-medium text-stone-600" htmlFor="login">
              {t("login.login")}
            </label>
            <input
              id="login"
              autoComplete="username"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none ring-stone-400 focus:ring-2"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
          </div>
          <div>
            <label
              className="block text-xs font-medium text-stone-600"
              htmlFor="password"
            >
              {t("login.password")}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none ring-stone-400 focus:ring-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? (
            <p className="text-center text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
          >
            {busy ? t("login.submitting") : t("login.submit")}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-stone-400">{t("login.footer")}</p>
        <p className="mt-2 text-center text-xs">
          <Link href="/" className="text-stone-600 underline">
            {t("login.homeLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
