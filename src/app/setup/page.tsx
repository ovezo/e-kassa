"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ikassirInvoke } from "@/lib/electron-api";
import { readSession, saveSession, type SessionUser } from "@/lib/session";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslations } from "@/lib/i18n/LocaleProvider";
import { NumberPad } from "@/components/NumberPad";

type Bootstrap = { needsSetup: boolean };

type SetupResult =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string };

export default function SetupPage() {
  const router = useRouter();
  const t = useTranslations();
  const [login, setLogin] = useState("admin");
  const [displayName, setDisplayName] = useState("Administrator");
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
        if (!boot.needsSetup) {
          router.replace("/login");
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
    if (password.length < 3) {
      setError(t("setup.passwordLabel"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await ikassirInvoke<SetupResult>("auth/setup-admin", {
        login,
        password,
        displayName,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      saveSession(res.user);
      router.replace("/pos/open");
    } catch {
      setError(t("setup.errComplete"));
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
          {t("setup.title")}
        </h1>
        <p className="mt-1 text-center text-sm text-stone-500">{t("setup.subtitle")}</p>
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-xs font-medium text-stone-600" htmlFor="dname">
              {t("setup.displayName")}
            </label>
            <input
              id="dname"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none ring-stone-400 focus:ring-2"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
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
            <label className="block text-xs font-medium text-stone-600 mb-2">
              {t("setup.passwordLabel")}
            </label>
            <div className="mb-4">
              <input
                type="password"
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-center text-lg tracking-widest outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-400/20"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSubmit(e as unknown as React.FormEvent);
                  }
                }}
                disabled={busy}
              />
            </div>
            <NumberPad
              value={password}
              onChange={setPassword}
              disabled={busy}
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
            className="w-full rounded-lg bg-amber-700 py-2.5 text-sm font-medium text-white transition hover:bg-amber-800 disabled:opacity-50"
          >
            {busy ? t("setup.submitting") : t("setup.submit")}
          </button>
        </form>
        <p className="mt-6 text-center text-xs">
          <Link href="/login" className="text-stone-600 underline">
            {t("setup.backLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
