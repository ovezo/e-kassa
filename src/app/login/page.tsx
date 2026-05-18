"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { unikassaInvoke } from "@/lib/electron-api";
import { readSession, saveSession, type SessionUser } from "@/lib/session";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslations } from "@/lib/i18n/LocaleProvider";
import { NumberPad } from "@/components/NumberPad";
import { Role } from "@prisma/client";

type Bootstrap = { needsSetup: boolean };

type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string };

type UserRow = {
  id: string;
  login: string;
  displayName: string;
  role: Role;
  active: boolean;
};

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);

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
        const boot = await unikassaInvoke<Bootstrap>("auth/bootstrap");
        if (cancelled) return;
        if (boot.needsSetup) {
          router.replace("/setup");
          return;
        }

        const list = await unikassaInvoke<UserRow[]>("users.list");
        if (cancelled) return;
        setUsers(list.filter((u) => u.active));
      } catch {
        if (!cancelled) setError(t("login.errDev"));
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, t]);

  async function onSubmit() {
    if (!selectedUser) return;
    if (password.length < 3) {
      setError(t("setup.passwordLabel"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await unikassaInvoke<LoginResult>("auth/login", {
        login: selectedUser.login,
        password,
      });
      if (!res.ok) {
        setError(res.error);
        setPassword("");
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
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 bg-stone-50">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-stone-800">
          {t("login.title")}
        </h1>
        <div className="mt-8">
          {loadingUsers ? (
            <div className="text-center text-stone-500 py-8">{t("common.loading")}</div>
          ) : !selectedUser ? (
            <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto p-1">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className="flex flex-col items-center justify-center rounded-xl border border-stone-200 bg-stone-50 p-4 text-center transition hover:bg-stone-100 active:scale-95"
                >
                  <span className="font-medium text-stone-800">{u.displayName}</span>
                  <span className="mt-1 text-xs text-stone-500">{u.role === "ADMIN" ? "Admin" : "Staff"}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3 border border-stone-200">
                <div>
                  <div className="font-medium text-stone-800">{selectedUser.displayName}</div>
                  <div className="text-xs text-stone-500">{selectedUser.role === "ADMIN" ? "Admin" : "Staff"}</div>
                </div>
                <button
                  onClick={() => {
                    setSelectedUser(null);
                    setPassword("");
                    setError(null);
                  }}
                  className="text-sm font-medium text-stone-600 hover:text-stone-900"
                >
                  {t("common.cancel")}
                </button>
              </div>

              <div>
                <div className="mb-4">
                  <input
                    type="password"
                    className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-center text-lg tracking-widest outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-400/20"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onSubmit();
                      }
                    }}
                    disabled={busy}
                    autoFocus
                  />
                </div>
                <NumberPad
                  value={password}
                  onChange={setPassword}
                  onSubmit={onSubmit}
                  disabled={busy}
                />
              </div>

              {error ? (
                <p className="text-center text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-stone-400">{t("login.footer")}</p>
        <p className="mt-2 text-center text-xs">
          <Link href="/" className="text-stone-600 underline">
            {t("login.homeLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
