"use client";

import { useState } from "react";
import { ikassirInvoke } from "@/lib/electron-api";
import { NumberPad } from "./NumberPad";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

interface ChangePasswordModalProps {
  userId: string;
  actorId?: string;
  userName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ChangePasswordModal({
  userId,
  actorId,
  userName,
  onClose,
  onSuccess,
}: ChangePasswordModalProps) {
  const t = useTranslations();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (password.length < 3) {
      setError("Password must be at least 3 characters");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await ikassirInvoke<{ ok: boolean; error?: string }>(
        "users.update",
        { id: userId, password, actorUserId: actorId },
      );
      if (!res.ok) {
        setError(res.error ?? "Update failed");
        return;
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-6 text-center">
          <h2 className="text-xl font-semibold text-stone-800">Change Password</h2>
          <p className="mt-1 text-sm text-stone-500">For {userName}</p>
        </div>

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

        {error ? (
          <p className="mt-4 text-center text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-sm font-medium text-stone-600 hover:text-stone-900"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
